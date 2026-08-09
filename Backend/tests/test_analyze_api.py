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


def test_extension_job_analyze_success(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import api as api_module

    job_id = uuid.uuid4()
    payload = AnalysisResponse(
        id=str(uuid.uuid4()),
        jobId=str(job_id),
        resumeId="resume_aaaaaaaaaaaa",
        company="Acme",
        role="SWE",
        overall_match=91,
        summary="Great fit",
        strengths=["Python"],
        missing_skills=["Go"],
        recommended_improvements=["Mention distributed systems"],
        matched_keywords=["Python"],
        missing_keywords=["Go"],
        confidence="High",
        llm_provider="groq",
        cached=False,
    )

    service = MagicMock()
    service.analyze_from_extension = AsyncMock(return_value=payload)
    monkeypatch.setattr(api_module, "MatchingService", lambda: service)

    res = client.post(
        "/extension/job",
        json={
            "url": "https://boards.greenhouse.io/acme/jobs/1",
            "ats": "greenhouse",
            "title": "SWE",
            "company": "Acme",
            "location": "Remote",
            "description": "Build great software with Python.",
            "resumeId": "resume_aaaaaaaaaaaa",
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["overall_match"] == 91
    assert body["missing_skills"] == ["Go"]
    service.analyze_from_extension.assert_awaited_once()


def test_extension_job_missing_resume_id_returns_400(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import api as api_module
    from matching.service import MatchingError

    service = MagicMock()
    service.analyze_from_extension = AsyncMock(
        side_effect=MatchingError(
            "resumeId is required. Upload a resume and set it in Options.",
            status_code=400,
        )
    )
    monkeypatch.setattr(api_module, "MatchingService", lambda: service)

    res = client.post(
        "/extension/job",
        json={
            "url": "https://jobs.lever.co/acme/abc",
            "ats": "lever",
            "description": "A role",
        },
    )
    assert res.status_code == 400
    assert "resumeId" in res.json()["detail"]


def test_analyze_passes_optional_description(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import api as api_module

    job_id = uuid.uuid4()
    payload = AnalysisResponse(
        id=str(uuid.uuid4()),
        jobId=str(job_id),
        resumeId="resume_aaaaaaaaaaaa",
        company="Acme",
        role="SWE",
        overall_match=70,
        summary="Ok",
        strengths=[],
        missing_skills=[],
        recommended_improvements=[],
        matched_keywords=[],
        missing_keywords=[],
        confidence="Medium",
        llm_provider="groq",
        cached=False,
    )

    service = MagicMock()
    service.analyze_job = AsyncMock(return_value=payload)
    monkeypatch.setattr(api_module, "MatchingService", lambda: service)

    scraped = "Full scraped description from the extension."
    res = client.post(
        f"/api/jobs/{job_id}/analyze",
        json={"resumeId": "resume_aaaaaaaaaaaa", "description": scraped},
    )
    assert res.status_code == 200
    kwargs = service.analyze_job.await_args.kwargs
    assert kwargs["description"] == scraped


def test_save_extension_job_description(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import api as api_module
    from datetime import datetime, timezone

    job_id = uuid.uuid4()
    job = MagicMock()
    job.id = job_id
    job.company = "Acme"
    job.role = "SWE"
    job.location = "Remote"
    job.apply_url = "https://example.com/job"
    job.age = "0d"
    job.source = "extension"
    job.faang = False
    job.no_sponsorship = False
    job.citizenship_required = False
    job.advanced_degree = False
    job.closed = False
    job.applied = False
    job.ats = "greenhouse"
    job.external_id = None
    job.role_family = None
    job.is_active = True
    job.sponsorship_available = None
    job.sponsorship_match = None
    job.sponsorship_confidence = 0.0
    job.created_at = datetime.now(timezone.utc)
    job.updated_at = datetime.now(timezone.utc)
    job.description = "Saved description text"

    monkeypatch.setattr(api_module, "persist_job_description", lambda *_a, **_k: job)

    res = client.post(
        f"/extension/job/{job_id}/description",
        json={"description": "Saved description text"},
    )
    assert res.status_code == 200
    assert res.json()["company"] == "Acme"


def test_extension_job_manual_selection_fields_accepted(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import api as api_module

    job_id = uuid.uuid4()
    payload = AnalysisResponse(
        id=str(uuid.uuid4()),
        jobId=str(job_id),
        resumeId="resume_aaaaaaaaaaaa",
        company="Acme",
        role="SWE",
        overall_match=88,
        summary="Good",
        strengths=["Python"],
        missing_skills=[],
        recommended_improvements=[],
        matched_keywords=["Python"],
        missing_keywords=[],
        confidence="High",
        llm_provider="groq",
        cached=False,
        canSaveDescription=True,
        descriptionPersisted=False,
    )

    service = MagicMock()
    service.analyze_from_extension = AsyncMock(return_value=payload)
    monkeypatch.setattr(api_module, "MatchingService", lambda: service)

    res = client.post(
        "/extension/job",
        json={
            "url": "https://boards.greenhouse.io/acme/jobs/9",
            "ats": "greenhouse",
            "title": "SWE",
            "company": "Acme",
            "description": "x" * 320,
            "resumeId": "resume_aaaaaaaaaaaa",
            "descriptionSource": "manual_selection",
            "persistDescription": False,
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["canSaveDescription"] is True
    assert body["descriptionPersisted"] is False
    call_body = service.analyze_from_extension.await_args.args[1]
    assert call_body.descriptionSource == "manual_selection"
    assert call_body.persistDescription is False


def test_flag_job_success(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import api as api_module
    from datetime import datetime, timezone

    job_id = uuid.uuid4()
    now = datetime.now(timezone.utc)

    class _Job:
        id = job_id
        company = "Acme"
        role = "Engineer"
        location = "Remote"
        apply_url = "https://example.com/job"
        age = "1d"
        source = "test"
        faang = False
        no_sponsorship = False
        citizenship_required = False
        advanced_degree = False
        closed = False
        applied = False
        saved = False
        flagged = True
        flagged_at = now
        ats = None
        external_id = None
        role_family = None
        is_active = True
        sponsorship_available = None
        sponsorship_match = None
        sponsorship_confidence = 0.0
        created_at = now
        updated_at = now
        min_years_required = None
        applied_at = None
        saved_at = None

    monkeypatch.setattr(
        api_module,
        "set_job_flagged",
        lambda _db, jid, flagged: _Job() if jid == job_id else None,
    )

    res = client.patch(
        f"/api/jobs/{job_id}/flagged",
        json={"flagged": True},
    )
    assert res.status_code == 200
    assert res.json()["flagged"] is True


def test_flag_job_not_found(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import api as api_module

    monkeypatch.setattr(api_module, "set_job_flagged", lambda *_a, **_k: None)

    res = client.patch(
        f"/api/jobs/{uuid.uuid4()}/flagged",
        json={"flagged": True},
    )
    assert res.status_code == 404
    assert res.json()["detail"] == "Job not found"
