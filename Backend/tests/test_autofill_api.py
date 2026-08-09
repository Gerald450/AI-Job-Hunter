"""Tests for AI autofill service, profile mapping, and extension routes."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient
from llm.base import LLMError
from matching.service import MatchingError
from schemas.analysis import EducationEntry, ExperienceEntry, ParsedResume
from schemas.autofill import (
    AiAutofillFieldResult,
    AiAutofillResponse,
    ExtensionUserProfile,
    UnresolvedField,
)


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    import api as api_module

    monkeypatch.setattr(api_module, "create_database", lambda: None)
    return TestClient(api_module.app)


def test_profile_from_parsed_maps_education() -> None:
    from autofill.service import profile_from_parsed

    parsed = ParsedResume(
        education=[
            EducationEntry(
                school="MIT",
                degree="BS",
                field="CS",
                dates="May 2027",
            )
        ],
        experience=[
            ExperienceEntry(company="Acme", title="Intern", dates="2025"),
            ExperienceEntry(company="Beta", title="SWE", dates="2026"),
        ],
    )
    profile = profile_from_parsed(parsed)
    assert profile.education == "MIT, CS"
    assert profile.degree == "BS"
    assert profile.graduationDate == "May 2027"
    assert profile.yearsExperience == 2.0
    assert profile.firstName is None
    assert profile.email is None


def test_build_profile_context_client_wins() -> None:
    from autofill.service import build_profile_context

    client = ExtensionUserProfile(
        firstName="Gerald",
        email="g@example.com",
        degree="MS",
    )
    parsed = ParsedResume(
        education=[
            EducationEntry(school="MIT", degree="BS", field="CS", dates="2027")
        ],
        skills=["Python", "Go"],
    )
    ctx = build_profile_context(client, parsed)
    assert ctx["personal"]["firstName"] == "Gerald"
    assert ctx["personal"]["email"] == "g@example.com"
    # Client degree overrides resume-derived degree
    assert ctx["personal"]["degree"] == "MS"
    assert ctx["skills"] == ["Python", "Go"]
    assert ctx["education"][0]["school"] == "MIT"


def test_normalize_drops_empty_and_malformed() -> None:
    from autofill.service import _normalize_llm_fields
    from schemas.autofill import LlmAutofillPayload, LlmFieldMapping

    requested = [
        UnresolvedField(uid="u1", label="First Name", selector="#fn"),
        UnresolvedField(uid="u2", label="GPA"),
    ]
    payload = LlmAutofillPayload(
        fields=[
            LlmFieldMapping(
                uid="u1",
                value="Gerald",
                profile_field="first_name",
                confidence=0.99,
            ),
            LlmFieldMapping(uid="u2", value="", profile_field="gpa", confidence=0.5),
            LlmFieldMapping(value={"bad": True}, confidence=0.9),
        ]
    )
    values = _normalize_llm_fields(payload, requested)
    assert len(values) == 1
    assert values[0].value == "Gerald"
    assert values[0].canonicalKey == "first_name"
    assert values[0].needsReview is False


def test_normalize_marks_review_below_threshold() -> None:
    from autofill.service import _normalize_llm_fields
    from schemas.autofill import LlmAutofillPayload, LlmFieldMapping

    requested = [UnresolvedField(uid="u1", label="Preferred Name")]
    payload = LlmAutofillPayload(
        fields=[
            LlmFieldMapping(
                uid="u1",
                value="Gerald",
                profile_field="first_name",
                confidence=0.75,
            )
        ]
    )
    values = _normalize_llm_fields(payload, requested)
    assert values[0].needsReview is True


def test_extension_profile_success(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import api as api_module

    row = MagicMock()
    row.parsed = {
        "education": [
            {
                "school": "MIT",
                "degree": "BS",
                "field": "CS",
                "dates": "May 2027",
            }
        ],
        "experience": [],
        "projects": [],
        "skills": [],
        "technologies": [],
        "certifications": [],
        "leadership": [],
        "awards": [],
    }

    service = MagicMock()
    service.ensure_resume_parsed = AsyncMock(return_value=row)
    monkeypatch.setattr(api_module, "MatchingService", lambda: service)

    res = client.post(
        "/extension/profile",
        json={"resumeId": "resume_aaaaaaaaaaaa"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["degree"] == "BS"
    assert body["graduationDate"] == "May 2027"
    assert body["education"] == "MIT, CS"


def test_extension_profile_missing_resume(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import api as api_module

    service = MagicMock()
    service.ensure_resume_parsed = AsyncMock(
        side_effect=MatchingError("Resume not found", status_code=404)
    )
    monkeypatch.setattr(api_module, "MatchingService", lambda: service)

    res = client.post(
        "/extension/profile",
        json={"resumeId": "resume_missing"},
    )
    assert res.status_code == 404


def test_extension_ai_autofill_success(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import api as api_module

    payload = AiAutofillResponse(
        values=[
            AiAutofillFieldResult(
                field="First Name",
                uid="u1",
                value="Gerald",
                canonicalKey="first_name",
                confidence=0.99,
            )
        ]
    )
    service = MagicMock()
    service.suggest_field_values = AsyncMock(return_value=payload)
    monkeypatch.setattr(api_module, "AutofillService", lambda: service)

    res = client.post(
        "/extension/autofill/ai",
        json={
            "resumeId": "resume_aaaaaaaaaaaa",
            "fields": [
                {
                    "uid": "u1",
                    "label": "First Name",
                    "type": "text",
                    "required": True,
                }
            ],
            "profile": {"firstName": "Gerald"},
            "ats": "greenhouse",
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["values"][0]["value"] == "Gerald"
    assert body["values"][0]["canonicalKey"] == "first_name"
    service.suggest_field_values.assert_awaited_once()


def test_extension_ai_autofill_llm_error(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import api as api_module

    service = MagicMock()
    service.suggest_field_values = AsyncMock(
        side_effect=MatchingError("Groq request timed out", status_code=504)
    )
    monkeypatch.setattr(api_module, "AutofillService", lambda: service)

    res = client.post(
        "/extension/autofill/ai",
        json={
            "resumeId": "resume_aaaaaaaaaaaa",
            "fields": [{"uid": "u1", "label": "Name"}],
        },
    )
    assert res.status_code == 504


@pytest.mark.asyncio
async def test_suggest_field_values_handles_malformed_llm_json() -> None:
    from autofill.service import AutofillService

    llm = MagicMock()
    llm.map_form_fields = AsyncMock(
        return_value={"fields": [{"uid": "u1", "value": "Gerald", "confidence": 0.95}]}
    )

    resume_row = MagicMock()
    resume_row.parsed = {"skills": ["Python"], "education": [], "experience": []}

    matching = MagicMock()
    matching.ensure_resume_parsed = AsyncMock(return_value=resume_row)

    service = AutofillService(llm=llm)
    db = MagicMock()

    # Patch MatchingService construction inside suggest_field_values
    import autofill.service as svc_mod

    original = svc_mod.MatchingService
    svc_mod.MatchingService = lambda llm=None: matching  # type: ignore[misc,assignment]
    try:
        result = await service.suggest_field_values(
            db,
            resume_id="resume_aaaaaaaaaaaa",
            fields=[UnresolvedField(uid="u1", label="First Name")],
            profile=ExtensionUserProfile(firstName="Gerald"),
        )
    finally:
        svc_mod.MatchingService = original

    assert len(result.values) == 1
    assert result.values[0].value == "Gerald"
    llm.map_form_fields.assert_awaited_once()


@pytest.mark.asyncio
async def test_suggest_field_values_propagates_llm_error() -> None:
    from autofill.service import AutofillService

    llm = MagicMock()
    llm.map_form_fields = AsyncMock(side_effect=LLMError("boom"))

    resume_row = MagicMock()
    resume_row.parsed = {}

    matching = MagicMock()
    matching.ensure_resume_parsed = AsyncMock(return_value=resume_row)

    service = AutofillService(llm=llm)
    db = MagicMock()

    import autofill.service as svc_mod

    original = svc_mod.MatchingService
    svc_mod.MatchingService = lambda llm=None: matching  # type: ignore[misc,assignment]
    try:
        with pytest.raises(MatchingError) as exc_info:
            await service.suggest_field_values(
                db,
                resume_id="resume_aaaaaaaaaaaa",
                fields=[UnresolvedField(uid="u1", label="Name")],
            )
    finally:
        svc_mod.MatchingService = original

    assert exc_info.value.status_code == 502
