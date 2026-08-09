"""On-demand resume matching orchestration."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from database.crud import (
    create_extension_job,
    get_job_by_apply_url,
    get_job_by_id,
)
from database.jobmodel import JobModel
from database.resume_crud import (
    create_resume,
    get_cached_analysis,
    get_resume_row,
    save_analysis,
)
from database.resumemodel import ResumeAnalysisModel, ResumeModel
from fetchers.exceptions import FetchError
from fetchers.router import FetcherRouter
from llm.base import LLMError, LLMProvider, LLMRateLimitError, LLMTimeoutError
from llm.groq import get_llm_provider
from matching.cache import description_hash as hash_description
from schemas.analysis import (
    AnalysisResponse,
    ExtensionJobAnalyzeRequest,
    ParsedResume,
    ResumeMatchResult,
)
from sponsorship.detector import SponsorshipDetector
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

MISSING_DESCRIPTION_MESSAGE = (
    "Unable to retrieve the job description.\n\n"
    "Resume analysis cannot be performed for this job."
)

# Descriptions shorter than this are treated as truncated / incomplete.
TRUNCATED_DESCRIPTION_CHARS = 400

# Hard cap when the employer/role explicitly does not sponsor visas.
NO_SPONSORSHIP_SCORE_CAP = 25

_sponsorship_detector = SponsorshipDetector()


class MatchingError(Exception):
    """Domain error for resume matching failures."""

    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


class DescriptionMissingError(MatchingError):
    def __init__(self) -> None:
        super().__init__(MISSING_DESCRIPTION_MESSAGE, status_code=422)


MANUAL_DESCRIPTION_SOURCES = frozenset({"manual_selection", "clipboard"})


def analysis_to_response(
    row: ResumeAnalysisModel,
    *,
    cached: bool = False,
    company: str | None = None,
    role: str | None = None,
    can_save_description: bool = False,
    description_persisted: bool = False,
) -> AnalysisResponse:
    return AnalysisResponse(
        id=str(row.id),
        jobId=str(row.job_id),
        resumeId=row.resume_id,
        company=company,
        role=role,
        overall_match=row.overall_match,
        summary=row.summary or "",
        strengths=list(row.strengths or []),
        missing_skills=list(row.missing_skills or []),
        recommended_improvements=list(row.recommendations or []),
        matched_keywords=list(row.matched_keywords or []),
        missing_keywords=list(row.missing_keywords or []),
        confidence=row.confidence,
        llm_provider=row.llm_provider,
        cached=cached,
        created_at=row.created_at,
        canSaveDescription=can_save_description,
        descriptionPersisted=description_persisted,
    )


def compose_client_description(
    *,
    description: str | None = None,
    requirements: str | None = None,
    responsibilities: str | None = None,
) -> str:
    """Merge scraped sections into one plain-text job description."""
    parts: list[str] = []
    if description and description.strip():
        parts.append(description.strip())
    if requirements and requirements.strip():
        parts.append("Requirements:\n" + requirements.strip())
    if responsibilities and responsibilities.strip():
        parts.append("Responsibilities:\n" + responsibilities.strip())
    return "\n\n".join(parts).strip()


def is_richer_description(existing: str | None, candidate: str | None) -> bool:
    """Return True when ``candidate`` should replace ``existing`` in the DB."""
    cand = (candidate or "").strip()
    if not cand:
        return False
    exist = (existing or "").strip()
    if not exist:
        return True
    if len(exist) < TRUNCATED_DESCRIPTION_CHARS and len(cand) > len(exist):
        return True
    if len(cand) >= int(len(exist) * 1.2) and len(cand) > len(exist):
        return True
    return False


def build_sponsorship_context(
    job: JobModel,
    description: str,
) -> dict[str, Any]:
    """Serialize known sponsorship signals for the match LLM."""
    detected = _sponsorship_detector.detect(description or "")
    return {
        "no_sponsorship_flag": bool(job.no_sponsorship),
        "sponsorship_available": job.sponsorship_available,
        "sponsorship_match": job.sponsorship_match,
        "sponsorship_confidence": job.sponsorship_confidence,
        "description_detection": {
            "sponsorship": detected.sponsorship,
            "matched_phrase": detected.matched_phrase,
            "confidence": detected.confidence,
        },
    }


def job_denies_sponsorship(job: JobModel, description: str) -> bool:
    """True when pipeline flags or JD text explicitly deny sponsorship."""
    if job.sponsorship_available is False:
        return True
    if job.no_sponsorship:
        return True
    detected = _sponsorship_detector.detect(description or "")
    return detected.sponsorship is False


def apply_no_sponsorship_penalty(result: ResumeMatchResult) -> ResumeMatchResult:
    """Hard-cap match score when the role does not sponsor visas."""
    capped = min(int(result.overall_match), NO_SPONSORSHIP_SCORE_CAP)
    missing_skills = list(result.missing_skills or [])
    missing_keywords = list(result.missing_keywords or [])
    improvements = list(result.recommended_improvements or [])
    note = "Employer does not offer visa sponsorship"

    def _has_sponsor_mention(items: list[str]) -> bool:
        return any("sponsor" in (item or "").lower() for item in items)

    if not _has_sponsor_mention(missing_skills):
        missing_skills.append(note)
    if not _has_sponsor_mention(missing_keywords):
        missing_keywords.append("visa sponsorship")
    if not _has_sponsor_mention(improvements):
        improvements.append(
            "Prioritize roles that explicitly offer visa sponsorship."
        )

    summary = (result.summary or "").strip()
    if "sponsor" not in summary.lower():
        prefix = (
            "This role/company does not sponsor visas, so the match score "
            "was reduced drastically. "
        )
        summary = prefix + summary if summary else prefix.strip()

    return result.model_copy(
        update={
            "overall_match": capped,
            "summary": summary,
            "missing_skills": missing_skills,
            "missing_keywords": missing_keywords,
            "recommended_improvements": improvements,
            "confidence": "High",
        }
    )


def prefer_richer_description(
    db: Session,
    job: JobModel,
    candidate: str | None,
    *,
    force: bool = False,
    persist: bool = True,
) -> tuple[str, bool]:
    """Return winning description text and whether it was written to the job row.

    When ``force`` is True, ``candidate`` always wins for analysis. Persistence
    still respects ``persist``.
    """
    cand = (candidate or "").strip()
    existing = (job.description or "").strip()

    if force and cand:
        persisted = False
        if persist and cand != existing:
            job.description = cand
            job.updated_at = datetime.now(timezone.utc)
            db.commit()
            db.refresh(job)
            persisted = True
        elif persist and cand == existing:
            persisted = True
        return cand, persisted

    if is_richer_description(existing, cand):
        if persist:
            job.description = cand
            job.updated_at = datetime.now(timezone.utc)
            db.commit()
            db.refresh(job)
            return cand, True
        return cand, False
    if existing:
        return existing, False
    return cand, False


async def ensure_job_description(
    db: Session,
    job: JobModel,
    *,
    router: FetcherRouter | None = None,
    client_description: str | None = None,
    force: bool = False,
    persist: bool = True,
) -> tuple[str, bool]:
    """Return (description, description_persisted), preferring client then fetch."""
    preferred, persisted = prefer_richer_description(
        db,
        job,
        client_description,
        force=force,
        persist=persist,
    )
    if preferred:
        return preferred, persisted

    fetcher = router or FetcherRouter()
    try:
        fetched = await fetcher.fetch(job.apply_url)
    except FetchError as exc:
        logger.warning("Description fetch failed for job %s: %s", job.id, exc)
        raise DescriptionMissingError() from exc
    except Exception as exc:
        logger.exception("Unexpected description fetch error for job %s", job.id)
        raise DescriptionMissingError() from exc

    text = (fetched.description or "").strip()
    if not text:
        raise DescriptionMissingError()

    if persist:
        job.description = text
        job.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(job)
        return text, True
    return text, False


def update_job_description(
    db: Session,
    job_id: uuid.UUID,
    description: str,
) -> JobModel:
    """Overwrite ``job.description`` for an existing row (no duplicate insert)."""
    job = get_job_by_id(db, job_id)
    if job is None:
        raise MatchingError("Job not found", status_code=404)
    text = (description or "").strip()
    if not text:
        raise MatchingError("description must not be empty", status_code=400)
    job.description = text
    job.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(job)
    return job


class MatchingService:
    """Resolve job description, cache, and call the LLM for resume match."""

    def __init__(
        self,
        llm: LLMProvider | None = None,
        *,
        router: FetcherRouter | None = None,
    ) -> None:
        self._llm = llm
        self._router = router

    def _provider(self) -> LLMProvider:
        if self._llm is not None:
            return self._llm
        return get_llm_provider()

    async def ensure_resume_parsed(
        self, db: Session, resume_id: str
    ) -> ResumeModel:
        """Load resume; lazily parse filesystem binary when ``parsed`` is empty."""
        row = get_resume_row(db, resume_id)
        if row is not None and row.parsed:
            return row

        from resumes.extract import extract_text
        from resumes.storage import (
            ResumeNotFoundError,
            content_hash,
            get_resume,
            save_parsed_resume,
            save_resume_text,
        )

        try:
            meta, content = get_resume(resume_id)
        except ResumeNotFoundError as exc:
            raise MatchingError("Resume not found", status_code=404) from exc

        text = extract_text(
            content=content,
            filename=meta.filename,
            content_type=meta.content_type,
        )
        save_resume_text(meta.resume_id, text)

        provider = self._provider()
        try:
            parsed = await provider.parse_resume(text)
        except LLMRateLimitError as exc:
            raise MatchingError(str(exc), status_code=429) from exc
        except LLMTimeoutError as exc:
            raise MatchingError(str(exc), status_code=504) from exc
        except LLMError as exc:
            raise MatchingError(str(exc), status_code=502) from exc

        parsed_dict: dict[str, Any] = parsed.model_dump()
        save_parsed_resume(meta.resume_id, parsed_dict)

        if row is None:
            return create_resume(
                db,
                resume_id=meta.resume_id,
                filename=meta.filename,
                content_type=meta.content_type,
                size=meta.size,
                parsed=parsed_dict,
                content_hash=content_hash(content),
            )

        row.parsed = parsed_dict
        db.commit()
        db.refresh(row)
        return row

    def _load_resume(self, db: Session, resume_id: str) -> ResumeModel:
        row = get_resume_row(db, resume_id)
        if row is None:
            raise MatchingError("Resume not found", status_code=404)
        if not row.parsed:
            raise MatchingError(
                "Resume has not been parsed yet. Re-upload the resume.",
                status_code=400,
            )
        return row

    def _load_job(self, db: Session, job_id: uuid.UUID) -> JobModel:
        job = get_job_by_id(db, job_id)
        if job is None:
            raise MatchingError("Job not found", status_code=404)
        return job

    async def analyze_job(
        self,
        db: Session,
        *,
        job_id: uuid.UUID,
        resume_id: str,
        refresh: bool = False,
        description: str | None = None,
    ) -> AnalysisResponse:
        resume = await self.ensure_resume_parsed(db, resume_id)
        job = self._load_job(db, job_id)

        try:
            resolved, description_persisted = await ensure_job_description(
                db,
                job,
                router=self._router,
                client_description=description,
            )
        except DescriptionMissingError:
            raise

        return await self._run_analysis(
            db,
            resume=resume,
            job=job,
            description=resolved,
            refresh=refresh,
            can_save_description=False,
            description_persisted=description_persisted,
        )

    async def analyze_from_extension(
        self,
        db: Session,
        body: ExtensionJobAnalyzeRequest,
    ) -> AnalysisResponse:
        """Analyze using scraped page data; upsert job and enrich description."""
        resume_id = (body.resumeId or "").strip()
        if not resume_id:
            raise MatchingError(
                "resumeId is required. Upload a resume and set it in Options.",
                status_code=400,
            )

        resume = await self.ensure_resume_parsed(db, resume_id)

        apply_url = body.url.strip()
        company = (body.company or "").strip() or "Unknown"
        role = (body.title or "").strip() or "Unknown Role"
        location = (body.location or "").strip() or "Unknown"

        job = get_job_by_apply_url(db, apply_url)
        if job is None:
            job = create_extension_job(
                db,
                apply_url=apply_url,
                company=company,
                role=role,
                location=location,
                ats=body.ats,
            )
        else:
            # Fill missing metadata from the live page when DB fields are placeholders.
            dirty = False
            if body.company and (not job.company or job.company == "Unknown"):
                job.company = body.company.strip()
                dirty = True
            if body.title and (not job.role or job.role == "Unknown Role"):
                job.role = body.title.strip()
                dirty = True
            if body.location and (not job.location or job.location == "Unknown"):
                job.location = body.location.strip()
                dirty = True
            if body.ats and body.ats != "unknown" and not job.ats:
                job.ats = body.ats
                dirty = True
            if dirty:
                job.updated_at = datetime.now(timezone.utc)
                db.commit()
                db.refresh(job)

        source = body.descriptionSource
        force = source in MANUAL_DESCRIPTION_SOURCES
        if body.persistDescription is not None:
            persist = body.persistDescription
        else:
            # Auto-persist DOM/API text; manual/clipboard waits for explicit Save.
            persist = not force

        # Manual/clipboard: use description alone (do not dilute with weak sections).
        if force:
            client_desc = (body.description or "").strip()
        else:
            client_desc = compose_client_description(
                description=body.description,
                requirements=body.requirements,
                responsibilities=body.responsibilities,
            )

        try:
            resolved, description_persisted = await ensure_job_description(
                db,
                job,
                router=self._router,
                client_description=client_desc or None,
                force=force,
                persist=persist,
            )
        except DescriptionMissingError:
            raise

        # Offer Save when manual/clipboard text was used but not written to DB.
        can_save = bool(force and client_desc and not description_persisted)

        return await self._run_analysis(
            db,
            resume=resume,
            job=job,
            description=resolved,
            refresh=body.refresh,
            can_save_description=can_save,
            description_persisted=description_persisted,
        )

    async def _run_analysis(
        self,
        db: Session,
        *,
        resume: ResumeModel,
        job: JobModel,
        description: str,
        refresh: bool,
        can_save_description: bool = False,
        description_persisted: bool = False,
    ) -> AnalysisResponse:
        desc_hash = hash_description(description)
        if not refresh:
            cached = get_cached_analysis(
                db,
                resume_id=resume.id,
                job_id=job.id,
                description_hash=desc_hash,
            )
            if cached is not None:
                return analysis_to_response(
                    cached,
                    cached=True,
                    company=job.company,
                    role=job.role,
                    can_save_description=can_save_description,
                    description_persisted=description_persisted,
                )

        provider = self._provider()
        try:
            parsed = ParsedResume.model_validate(resume.parsed)
            sponsorship = build_sponsorship_context(job, description)
            result: ResumeMatchResult = await provider.analyze_resume(
                parsed_resume=parsed,
                job_title=job.role,
                company=job.company,
                location=job.location or "",
                description=description,
                sponsorship=sponsorship,
            )
            if job_denies_sponsorship(job, description):
                result = apply_no_sponsorship_penalty(result)
        except LLMRateLimitError as exc:
            raise MatchingError(str(exc), status_code=429) from exc
        except LLMTimeoutError as exc:
            raise MatchingError(str(exc), status_code=504) from exc
        except LLMError as exc:
            raise MatchingError(str(exc), status_code=502) from exc
        except Exception as exc:
            logger.exception("Unexpected LLM error analyzing job %s", job.id)
            raise MatchingError(
                "Resume analysis failed due to an unexpected error.",
                status_code=502,
            ) from exc

        row = save_analysis(
            db,
            resume_id=resume.id,
            job_id=job.id,
            result=result,
            description_hash=desc_hash,
            llm_provider=provider.name,
            replace=refresh,
        )
        return analysis_to_response(
            row,
            cached=False,
            company=job.company,
            role=job.role,
            can_save_description=can_save_description,
            description_persisted=description_persisted,
        )


async def ingest_resume(
    db: Session,
    *,
    filename: str,
    content: bytes,
    content_type: str | None,
    llm: LLMProvider | None = None,
) -> ResumeModel:
    """Save binary, extract text, parse once with LLM, persist DB + sidecars."""
    from resumes.extract import extract_text
    from resumes.storage import (
        content_hash,
        save_parsed_resume,
        save_resume,
        save_resume_text,
    )

    meta = save_resume(
        filename=filename,
        content=content,
        content_type=content_type,
    )
    text = extract_text(
        content=content,
        filename=meta.filename,
        content_type=meta.content_type,
    )
    save_resume_text(meta.resume_id, text)

    provider = llm or get_llm_provider()
    try:
        parsed = await provider.parse_resume(text)
    except LLMRateLimitError as exc:
        raise MatchingError(str(exc), status_code=429) from exc
    except LLMTimeoutError as exc:
        raise MatchingError(str(exc), status_code=504) from exc
    except LLMError as exc:
        raise MatchingError(str(exc), status_code=502) from exc

    parsed_dict: dict[str, Any] = parsed.model_dump()
    save_parsed_resume(meta.resume_id, parsed_dict)

    return create_resume(
        db,
        resume_id=meta.resume_id,
        filename=meta.filename,
        content_type=meta.content_type,
        size=meta.size,
        parsed=parsed_dict,
        content_hash=content_hash(content),
    )
