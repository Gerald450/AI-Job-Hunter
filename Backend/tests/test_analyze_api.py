"""API-level tests for analyze endpoints (mocked matching service)."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from matching.service import DescriptionMissingError
from schemas.analysis import AnalysisResponse


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    import api as api_module

    monkeypatch.setattr(api_module, "create_database", lambda: None)
    return TestClient(api_module.app)


def test_analyze_missing_description_returns_422(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import api as api_module

    service = MagicMock()
    service.analyze_job = AsyncMock(side_effect=DescriptionMissingError())

    monkeypatch.setattr(api_module, "MatchingService", lambda: service)

    res = client.post(
        f"/api/jobs/{uuid.uuid4()}/analyze",
        json={"resumeId": "resume_aaaaaaaaaaaa"},
    )
    assert res.status_code == 422
    assert "Unable to retrieve the job description" in res.json()["detail"]
    assert "Resume analysis cannot be performed" in res.json()["detail"]


def test_analyze_success(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    import api as api_module

    job_id = uuid.uuid4()
    payload = AnalysisResponse(
        id=str(uuid.uuid4()),
        jobId=str(job_id),
        resumeId="resume_aaaaaaaaaaaa",
        company="Acme",
        role="SWE",
        overall_match=90,
        summary="Great",
        strengths=["Python"],
        missing_skills=[],
        recommended_improvements=[],
        matched_keywords=["Python"],
        missing_keywords=[],
        confidence="High",
        llm_provider="groq",
        cached=False,
    )

    service = MagicMock()
    service.analyze_job = AsyncMock(return_value=payload)
    monkeypatch.setattr(api_module, "MatchingService", lambda: service)

    res = client.post(
        f"/api/jobs/{job_id}/analyze",
        json={"resumeId": "resume_aaaaaaaaaaaa"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["overall_match"] == 90
    assert body["company"] == "Acme"


def test_batch_analyze_sse(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    import api as api_module

    job_id = uuid.uuid4()
    payload = AnalysisResponse(
        id=str(uuid.uuid4()),
        jobId=str(job_id),
        resumeId="resume_aaaaaaaaaaaa",
        company="Acme",
        role="SWE",
        overall_match=80,
        summary="Ok",
        strengths=[],
        missing_skills=[],
        recommended_improvements=[],
        matched_keywords=[],
        missing_keywords=[],
        confidence="Medium",
        llm_provider="groq",
        cached=True,
    )

    service = MagicMock()
    service.analyze_job = AsyncMock(return_value=payload)
    monkeypatch.setattr(api_module, "MatchingService", lambda: service)

    with client.stream(
        "POST",
        "/api/jobs/analyze/batch",
        json={"resumeId": "resume_aaaaaaaaaaaa", "jobIds": [str(job_id)]},
    ) as res:
        assert res.status_code == 200
        text = "".join(res.iter_text())

    assert "event: progress" in text
    assert "event: result" in text
    assert "event: done" in text
    assert '"overall_match": 80' in text or '"overall_match":80' in text
