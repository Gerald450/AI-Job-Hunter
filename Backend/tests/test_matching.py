"""Tests for Groq JSON parsing and matching service (mocked LLM / fetch)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from llm.base import LLMError
from llm.groq import GroqProvider, _extract_json_object
from matching.service import (
    MISSING_DESCRIPTION_MESSAGE,
    DescriptionMissingError,
    MatchingService,
)
from schemas.analysis import ParsedResume, ResumeMatchResult


def test_extract_json_object_plain() -> None:
    data = _extract_json_object('{"overall_match": 80, "summary": "ok"}')
    assert data["overall_match"] == 80


def test_extract_json_object_fenced() -> None:
    raw = '```json\n{"overall_match": 70}\n```'
    assert _extract_json_object(raw)["overall_match"] == 70


def test_extract_json_object_malformed() -> None:
    with pytest.raises(LLMError, match="malformed"):
        _extract_json_object("not json at all")


def test_match_prompt_weighs_years_of_experience() -> None:
    from llm.prompts import MATCH_RESUME_SYSTEM, build_match_user_prompt

    assert "required years of experience" in MATCH_RESUME_SYSTEM.lower()
    assert "internship" in MATCH_RESUME_SYSTEM.lower()
    assert "industry" in MATCH_RESUME_SYSTEM.lower()
    assert "sponsor" in MATCH_RESUME_SYSTEM.lower()

    user = build_match_user_prompt(
        parsed_resume={"skills": ["Python"]},
        job_title="SWE",
        company="Acme",
        location="Remote",
        description="Requires 2+ years of industry experience.",
        sponsorship={
            "no_sponsorship_flag": True,
            "sponsorship_available": False,
        },
    )
    assert "years of experience" in user.lower()
    assert "internships" in user.lower()
    assert "sponsorship metadata" in user.lower()
    assert "≤25" in user or "drastically" in user.lower()


def test_apply_no_sponsorship_penalty_caps_score() -> None:
    from matching.service import (
        NO_SPONSORSHIP_SCORE_CAP,
        apply_no_sponsorship_penalty,
        job_denies_sponsorship,
    )

    result = ResumeMatchResult(
        overall_match=88,
        summary="Strong skills match.",
        strengths=["Python"],
        missing_skills=[],
        recommended_improvements=[],
        matched_keywords=["Python"],
        missing_keywords=[],
        confidence="High",
    )
    penalized = apply_no_sponsorship_penalty(result)
    assert penalized.overall_match == NO_SPONSORSHIP_SCORE_CAP
    assert "sponsor" in penalized.summary.lower()
    assert any("sponsor" in s.lower() for s in penalized.missing_skills)

    job = MagicMock()
    job.sponsorship_available = False
    job.no_sponsorship = False
    assert job_denies_sponsorship(job, "Great benefits") is True

    job.sponsorship_available = None
    job.no_sponsorship = True
    assert job_denies_sponsorship(job, "") is True

    job.sponsorship_available = None
    job.no_sponsorship = False
    assert (
        job_denies_sponsorship(job, "No visa sponsorship for this position.")
        is True
    )
    assert job_denies_sponsorship(job, "We hire new grads.") is False


@pytest.mark.asyncio
async def test_analyze_missing_description_skips_llm() -> None:
    llm = MagicMock()
    llm.name = "groq"
    llm.analyze_resume = AsyncMock()

    router = MagicMock()
    router.fetch = AsyncMock(side_effect=Exception("fetch failed"))

    job = MagicMock()
    job.id = uuid.uuid4()
    job.description = None
    job.apply_url = "https://example.com/job"
    job.company = "Acme"
    job.role = "SWE"
    job.location = "Remote"

    resume = MagicMock()
    resume.id = "resume_aaaaaaaaaaaa"
    resume.parsed = ParsedResume(skills=["Python"]).model_dump()

    db = MagicMock()

    service = MatchingService(llm=llm, router=router)
    service.ensure_resume_parsed = AsyncMock(return_value=resume)  # type: ignore[method-assign]
    service._load_job = MagicMock(return_value=job)  # type: ignore[method-assign]

    with pytest.raises(DescriptionMissingError) as exc:
        await service.analyze_job(
            db,
            job_id=job.id,
            resume_id=resume.id,
        )

    assert str(exc.value) == MISSING_DESCRIPTION_MESSAGE
    llm.analyze_resume.assert_not_called()


@pytest.mark.asyncio
async def test_analyze_uses_cache() -> None:
    llm = MagicMock()
    llm.name = "groq"
    llm.analyze_resume = AsyncMock()

    job_id = uuid.uuid4()
    job = MagicMock()
    job.id = job_id
    job.description = "Build APIs with Python and FastAPI."
    job.company = "Acme"
    job.role = "Backend Engineer"
    job.location = "NYC"
    job.apply_url = "https://example.com/job"

    resume = MagicMock()
    resume.id = "resume_bbbbbbbbbbbb"
    resume.parsed = ParsedResume(skills=["Python"]).model_dump()

    cached = MagicMock()
    cached.id = uuid.uuid4()
    cached.job_id = job_id
    cached.resume_id = resume.id
    cached.overall_match = 88
    cached.summary = "Strong match"
    cached.strengths = ["Python"]
    cached.missing_skills = []
    cached.recommendations = []
    cached.matched_keywords = ["Python"]
    cached.missing_keywords = []
    cached.confidence = "High"
    cached.llm_provider = "groq"
    cached.created_at = datetime.now(timezone.utc)

    db = MagicMock()

    service = MatchingService(llm=llm)
    service.ensure_resume_parsed = AsyncMock(return_value=resume)  # type: ignore[method-assign]
    service._load_job = MagicMock(return_value=job)  # type: ignore[method-assign]

    from matching import service as service_module

    monkey_get = MagicMock(return_value=cached)
    original = service_module.get_cached_analysis
    service_module.get_cached_analysis = monkey_get
    try:
        result = await service.analyze_job(
            db,
            job_id=job_id,
            resume_id=resume.id,
            refresh=False,
        )
    finally:
        service_module.get_cached_analysis = original

    assert result.cached is True
    assert result.overall_match == 88
    llm.analyze_resume.assert_not_called()


@pytest.mark.asyncio
async def test_analyze_calls_llm_and_saves(monkeypatch: pytest.MonkeyPatch) -> None:
    match = ResumeMatchResult(
        overall_match=75,
        summary="Good fit",
        strengths=["Python"],
        missing_skills=["Kubernetes"],
        recommended_improvements=["Add K8s project"],
        matched_keywords=["Python"],
        missing_keywords=["Kubernetes"],
        confidence="Medium",
    )

    llm = MagicMock()
    llm.name = "groq"
    llm.analyze_resume = AsyncMock(return_value=match)

    job_id = uuid.uuid4()
    job = MagicMock()
    job.id = job_id
    job.description = "Need Python engineer."
    job.company = "Acme"
    job.role = "SWE"
    job.location = ""
    job.apply_url = "https://example.com/job"

    resume = MagicMock()
    resume.id = "resume_cccccccccccc"
    resume.parsed = ParsedResume(skills=["Python"]).model_dump()

    saved = MagicMock()
    saved.id = uuid.uuid4()
    saved.job_id = job_id
    saved.resume_id = resume.id
    saved.overall_match = 75
    saved.summary = "Good fit"
    saved.strengths = ["Python"]
    saved.missing_skills = ["Kubernetes"]
    saved.recommendations = ["Add K8s project"]
    saved.matched_keywords = ["Python"]
    saved.missing_keywords = ["Kubernetes"]
    saved.confidence = "Medium"
    saved.llm_provider = "groq"
    saved.created_at = datetime.now(timezone.utc)

    db = MagicMock()
    service = MatchingService(llm=llm)
    service.ensure_resume_parsed = AsyncMock(return_value=resume)  # type: ignore[method-assign]
    service._load_job = MagicMock(return_value=job)  # type: ignore[method-assign]

    import matching.service as service_module

    monkeypatch.setattr(service_module, "get_cached_analysis", lambda *a, **k: None)
    monkeypatch.setattr(service_module, "save_analysis", lambda *a, **k: saved)

    result = await service.analyze_job(
        db,
        job_id=job_id,
        resume_id=resume.id,
    )
    assert result.cached is False
    assert result.overall_match == 75
    llm.analyze_resume.assert_awaited_once()


def test_compose_and_prefer_richer_description() -> None:
    from matching.service import (
        compose_client_description,
        is_richer_description,
        prefer_richer_description,
    )

    composed = compose_client_description(
        description="About the role.",
        requirements="Python",
        responsibilities="Build APIs",
    )
    assert "Requirements:" in composed
    assert "Responsibilities:" in composed

    assert is_richer_description(None, "full text") is True
    assert is_richer_description("short", "x" * 500) is True
    assert is_richer_description("x" * 500, "short") is False
    assert is_richer_description("a" * 100, "b" * 130) is True

    job = MagicMock()
    job.description = "x" * 500
    job.updated_at = datetime.now(timezone.utc)
    db = MagicMock()

    # Force prefers shorter manual text for analysis; persist=False skips DB write.
    text, persisted = prefer_richer_description(
        db, job, "manual " * 40, force=True, persist=False
    )
    assert text.startswith("manual")
    assert persisted is False
    assert job.description == "x" * 500
    db.commit.assert_not_called()

    # Force + persist overwrites even when shorter than existing.
    text, persisted = prefer_richer_description(
        db, job, "manual " * 40, force=True, persist=True
    )
    assert text.startswith("manual")
    assert persisted is True
    assert job.description.startswith("manual")
    db.commit.assert_called()


@pytest.mark.asyncio
async def test_analyze_from_extension_manual_no_persist(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from schemas.analysis import ExtensionJobAnalyzeRequest

    match = ResumeMatchResult(
        overall_match=85,
        summary="Ok",
        strengths=["Python"],
        missing_skills=[],
        recommended_improvements=[],
        matched_keywords=["Python"],
        missing_keywords=[],
        confidence="High",
    )
    llm = MagicMock()
    llm.name = "groq"
    llm.analyze_resume = AsyncMock(return_value=match)

    resume = MagicMock()
    resume.id = "resume_eeeeeeeeeeee"
    resume.parsed = ParsedResume(skills=["Python"]).model_dump()

    job = MagicMock()
    job.id = uuid.uuid4()
    job.description = "x" * 600
    job.company = "Acme"
    job.role = "SWE"
    job.location = "Remote"
    job.apply_url = "https://boards.greenhouse.io/acme/jobs/2"
    job.ats = "greenhouse"
    job.updated_at = datetime.now(timezone.utc)

    saved = MagicMock()
    saved.id = uuid.uuid4()
    saved.job_id = job.id
    saved.resume_id = resume.id
    saved.overall_match = 85
    saved.summary = "Ok"
    saved.strengths = ["Python"]
    saved.missing_skills = []
    saved.recommendations = []
    saved.matched_keywords = ["Python"]
    saved.missing_keywords = []
    saved.confidence = "High"
    saved.llm_provider = "groq"
    saved.created_at = datetime.now(timezone.utc)

    db = MagicMock()
    service = MatchingService(llm=llm)
    service.ensure_resume_parsed = AsyncMock(return_value=resume)  # type: ignore[method-assign]

    import matching.service as service_module

    monkeypatch.setattr(
        service_module, "get_job_by_apply_url", lambda *_a, **_k: job
    )
    monkeypatch.setattr(service_module, "get_cached_analysis", lambda *a, **k: None)
    monkeypatch.setattr(service_module, "save_analysis", lambda *a, **k: saved)

    manual = "Selected job description text. " * 20
    body = ExtensionJobAnalyzeRequest(
        url=job.apply_url,
        ats="greenhouse",
        title="SWE",
        company="Acme",
        location="Remote",
        description=manual,
        resumeId=resume.id,
        descriptionSource="manual_selection",
        persistDescription=False,
    )
    result = await service.analyze_from_extension(db, body)
    assert result.overall_match == 85
    assert result.canSaveDescription is True
    assert result.descriptionPersisted is False
    # Longer truncated DB text must not be overwritten without persist.
    assert job.description == "x" * 600
    # LLM must receive the manual selection, not the DB blob.
    call_kwargs = llm.analyze_resume.await_args.kwargs
    assert call_kwargs["description"] == manual.strip()


def test_update_job_description_no_duplicate() -> None:
    from matching.service import update_job_description
    from unittest.mock import patch

    job_id = uuid.uuid4()
    job = MagicMock()
    job.id = job_id
    job.description = None
    job.updated_at = datetime.now(timezone.utc)

    db = MagicMock()
    import matching.service as service_module

    with patch.object(service_module, "get_job_by_id", return_value=job):
        updated = update_job_description(db, job_id, "Full description " * 30)
    assert updated.description.startswith("Full description")
    db.commit.assert_called()
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_analyze_from_extension_uses_client_description(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from schemas.analysis import ExtensionJobAnalyzeRequest

    match = ResumeMatchResult(
        overall_match=91,
        summary="Strong",
        strengths=["Python"],
        missing_skills=[],
        recommended_improvements=[],
        matched_keywords=["Python"],
        missing_keywords=[],
        confidence="High",
    )
    llm = MagicMock()
    llm.name = "groq"
    llm.analyze_resume = AsyncMock(return_value=match)

    resume = MagicMock()
    resume.id = "resume_dddddddddddd"
    resume.parsed = ParsedResume(skills=["Python"]).model_dump()

    job = MagicMock()
    job.id = uuid.uuid4()
    job.description = "tiny"
    job.company = "Acme"
    job.role = "SWE"
    job.location = "Remote"
    job.apply_url = "https://boards.greenhouse.io/acme/jobs/1"
    job.ats = "greenhouse"
    job.updated_at = datetime.now(timezone.utc)

    saved = MagicMock()
    saved.id = uuid.uuid4()
    saved.job_id = job.id
    saved.resume_id = resume.id
    saved.overall_match = 91
    saved.summary = "Strong"
    saved.strengths = ["Python"]
    saved.missing_skills = []
    saved.recommendations = []
    saved.matched_keywords = ["Python"]
    saved.missing_keywords = []
    saved.confidence = "High"
    saved.llm_provider = "groq"
    saved.created_at = datetime.now(timezone.utc)

    db = MagicMock()
    service = MatchingService(llm=llm)
    service.ensure_resume_parsed = AsyncMock(return_value=resume)  # type: ignore[method-assign]

    import matching.service as service_module

    monkeypatch.setattr(
        service_module, "get_job_by_apply_url", lambda *_a, **_k: job
    )
    monkeypatch.setattr(service_module, "get_cached_analysis", lambda *a, **k: None)
    monkeypatch.setattr(service_module, "save_analysis", lambda *a, **k: saved)

    body = ExtensionJobAnalyzeRequest(
        url=job.apply_url,
        ats="greenhouse",
        title="SWE",
        company="Acme",
        location="Remote",
        description="x" * 500,
        resumeId=resume.id,
    )
    result = await service.analyze_from_extension(db, body)
    assert result.overall_match == 91
    assert job.description == "x" * 500
    assert result.descriptionPersisted is True
    llm.analyze_resume.assert_awaited_once()


@pytest.mark.asyncio
async def test_groq_provider_parse_validates(monkeypatch: pytest.MonkeyPatch) -> None:
    provider = GroqProvider(api_key="test-key", model="test-model")

    async def fake_chat(**kwargs: Any) -> dict[str, Any]:
        return {
            "education": [],
            "experience": [],
            "projects": [],
            "skills": ["Python"],
            "technologies": ["FastAPI"],
            "certifications": [],
            "leadership": [],
            "awards": [],
        }

    monkeypatch.setattr(provider, "_chat_json", fake_chat)
    parsed = await provider.parse_resume("Python developer resume")
    assert parsed.skills == ["Python"]
    assert parsed.technologies == ["FastAPI"]
