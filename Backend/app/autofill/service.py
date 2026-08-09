"""AI autofill orchestration: merge profile + ParsedResume, call Groq once."""

from __future__ import annotations

import logging
from typing import Any, Optional

from llm.base import LLMError, LLMProvider, LLMRateLimitError, LLMTimeoutError
from llm.groq import get_llm_provider
from matching.service import MatchingError, MatchingService
from schemas.analysis import ParsedResume
from schemas.autofill import (
    AiAutofillFieldResult,
    AiAutofillJobContext,
    AiAutofillResponse,
    ExtensionUserProfile,
    LlmAutofillPayload,
    LlmFieldMapping,
    UnresolvedField,
)
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

REVIEW_THRESHOLD = 0.90


def profile_from_parsed(parsed: ParsedResume | dict[str, Any]) -> ExtensionUserProfile:
    """Map ParsedResume into a contact-light UserProfile for /extension/profile."""
    if isinstance(parsed, dict):
        try:
            parsed = ParsedResume.model_validate(parsed)
        except Exception:
            parsed = ParsedResume()

    education_str: Optional[str] = None
    degree: Optional[str] = None
    graduation: Optional[str] = None

    if parsed.education:
        first = parsed.education[0]
        parts = [p for p in (first.school, first.field) if p]
        education_str = ", ".join(parts) if parts else (first.school or None)
        degree = first.degree or None
        graduation = first.dates or None

    years: Optional[float] = None
    if parsed.experience:
        years = float(len(parsed.experience))

    return ExtensionUserProfile(
        education=education_str,
        degree=degree,
        graduationDate=graduation,
        yearsExperience=years,
    )


def build_profile_context(
    client_profile: ExtensionUserProfile | dict[str, Any] | None,
    parsed_resume: ParsedResume | dict[str, Any] | None,
) -> dict[str, Any]:
    """Merge extension profile with ParsedResume for the LLM.

    Client contact / auth fields win. Resume supplies education, experience,
    projects, skills, certifications. Never includes raw resume text.
    """
    if isinstance(client_profile, ExtensionUserProfile):
        client = client_profile.model_dump(exclude_none=True)
    elif isinstance(client_profile, dict):
        client = {k: v for k, v in client_profile.items() if v is not None}
    else:
        client = {}

    if isinstance(parsed_resume, ParsedResume):
        parsed = parsed_resume.model_dump()
    elif isinstance(parsed_resume, dict):
        parsed = parsed_resume
    else:
        parsed = {}

    from_resume = profile_from_parsed(parsed).model_dump(exclude_none=True)

    # Client overrides resume-derived contact-ish / preference fields.
    personal = {**from_resume, **client}

    return {
        "personal": personal,
        "education": parsed.get("education") or [],
        "experience": parsed.get("experience") or [],
        "projects": parsed.get("projects") or [],
        "skills": parsed.get("skills") or [],
        "technologies": parsed.get("technologies") or [],
        "certifications": parsed.get("certifications") or [],
        "leadership": parsed.get("leadership") or [],
        "awards": parsed.get("awards") or [],
    }


def _field_to_dict(field: UnresolvedField) -> dict[str, Any]:
    surrounding = field.surrounding_text or field.nearbyText
    section = field.section or field.parentSection
    return {
        "uid": field.uid,
        "selector": field.selector,
        "label": field.label,
        "placeholder": field.placeholder,
        "name": field.name,
        "id": field.id,
        "type": field.type,
        "required": field.required,
        "options": field.options,
        "surrounding_text": surrounding,
        "section": section,
        "canonicalKey": field.canonicalKey,
    }


def _normalize_llm_fields(
    payload: LlmAutofillPayload,
    requested: list[UnresolvedField],
) -> list[AiAutofillFieldResult]:
    """Validate LLM mappings and convert to extension wire format."""
    by_uid = {f.uid: f for f in requested if f.uid}
    by_selector = {f.selector: f for f in requested if f.selector}
    by_label = {f.label.strip().lower(): f for f in requested if f.label}

    results: list[AiAutofillFieldResult] = []
    for raw in payload.fields:
        try:
            mapping = (
                raw
                if isinstance(raw, LlmFieldMapping)
                else LlmFieldMapping.model_validate(raw)
            )
        except Exception as exc:
            logger.warning("Dropping malformed LLM field mapping: %s", exc)
            continue

        if mapping.value is None or mapping.value == "":
            continue

        matched: UnresolvedField | None = None
        if mapping.uid and mapping.uid in by_uid:
            matched = by_uid[mapping.uid]
        elif mapping.selector and mapping.selector in by_selector:
            matched = by_selector[mapping.selector]
        elif mapping.field and mapping.field.strip().lower() in by_label:
            matched = by_label[mapping.field.strip().lower()]

        label = (
            (matched.label if matched else None)
            or mapping.field
            or mapping.selector
            or mapping.uid
            or "unknown"
        )
        confidence = float(mapping.confidence)
        value = mapping.value
        if isinstance(value, (dict, list)):
            continue

        results.append(
            AiAutofillFieldResult(
                field=label,
                uid=mapping.uid or (matched.uid if matched else None),
                selector=mapping.selector or (matched.selector if matched else None),
                value=value,
                canonicalKey=mapping.profile_field,
                confidence=confidence,
                explanation=mapping.explanation,
                needsReview=confidence < REVIEW_THRESHOLD,
            )
        )
    return results


class AutofillService:
    """Reusable AI autofill engine (form completion today; extensible later)."""

    def __init__(self, llm: LLMProvider | None = None) -> None:
        self._llm = llm

    def _provider(self) -> LLMProvider:
        if self._llm is not None:
            return self._llm
        return get_llm_provider()

    async def suggest_field_values(
        self,
        db: Session,
        *,
        resume_id: str,
        fields: list[UnresolvedField],
        profile: ExtensionUserProfile | None = None,
        job: AiAutofillJobContext | None = None,
        ats: str | None = None,
    ) -> AiAutofillResponse:
        if not fields:
            return AiAutofillResponse(values=[])

        matching = MatchingService(llm=self._llm)
        resume = await matching.ensure_resume_parsed(db, resume_id)

        try:
            parsed = ParsedResume.model_validate(resume.parsed or {})
        except Exception:
            parsed = ParsedResume()

        context = build_profile_context(profile, parsed)
        field_dicts = [_field_to_dict(f) for f in fields]
        job_context: dict[str, Any] | None = None
        if job is not None:
            job_context = job.model_dump(exclude_none=True)
            if ats:
                job_context["ats"] = ats
        elif ats:
            job_context = {"ats": ats}

        provider = self._provider()
        try:
            raw = await provider.map_form_fields(
                profile=context,
                fields=field_dicts,
                job_context=job_context,
            )
        except LLMRateLimitError as exc:
            raise MatchingError(str(exc), status_code=429) from exc
        except LLMTimeoutError as exc:
            raise MatchingError(str(exc), status_code=504) from exc
        except LLMError as exc:
            raise MatchingError(str(exc), status_code=502) from exc

        try:
            payload = LlmAutofillPayload.model_validate(raw)
        except Exception as exc:
            logger.warning("AI autofill payload validation failed: %s", exc)
            # Best-effort: accept {fields: [...]} with per-item drops.
            fields_raw = raw.get("fields") if isinstance(raw, dict) else None
            if not isinstance(fields_raw, list):
                raise MatchingError(
                    "AI autofill returned invalid JSON", status_code=502
                ) from exc
            payload = LlmAutofillPayload(fields=[])
            for item in fields_raw:
                try:
                    payload.fields.append(LlmFieldMapping.model_validate(item))
                except Exception:
                    continue

        values = _normalize_llm_fields(payload, fields)
        return AiAutofillResponse(values=values)
