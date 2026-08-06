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
    service._load_resume = MagicMock(return_value=resume)  # type: ignore[method-assign]
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
    service._load_resume = MagicMock(return_value=resume)  # type: ignore[method-assign]
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
    service._load_resume = MagicMock(return_value=resume)  # type: ignore[method-assign]
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
