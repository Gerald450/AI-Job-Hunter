"""API filter tests for conference endpoints (mocked CRUD)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from model.conference import EligibilityStatus, LocationStatus


def _row(**overrides):
    now = datetime.now(timezone.utc)
    data = {
        "id": uuid.uuid4(),
        "name": "US Undergrad Conf",
        "organization": "ACM",
        "description": None,
        "official_url": "https://example.com/conf",
        "source": "usenix",
        "source_url": "https://example.com/conf",
        "location": "Austin, TX",
        "country": "United States",
        "city": "Austin",
        "state": "TX",
        "is_virtual": False,
        "location_status": LocationStatus.US.value,
        "start_date": None,
        "end_date": None,
        "call_for_papers_deadline": None,
        "paper_submission_deadline": None,
        "abstract_deadline": None,
        "registration_deadline": None,
        "student_registration_deadline": None,
        "funding_deadline": None,
        "application_deadline": None,
        "conference_type": None,
        "topics": ["computer_science"],
        "student_eligible": True,
        "undergraduate_eligible": True,
        "graduate_eligible": True,
        "funding_available": True,
        "travel_grant_available": True,
        "registration_waiver_available": False,
        "scholarship_available": False,
        "funding_amount": "$1000",
        "funding_requirements": None,
        "citizenship_requirements": None,
        "residency_requirements": None,
        "eligibility_requirements": "Open to undergraduate students",
        "application_url": None,
        "status": "upcoming",
        "last_verified_at": None,
        "eligibility_status": EligibilityStatus.ELIGIBLE.value,
        "funding_status": "FUNDING_AVAILABLE",
        "citizenship_status": EligibilityStatus.ELIGIBLE.value,
        "funding_eligibility_status": EligibilityStatus.LIKELY_ELIGIBLE.value,
        "match_score": 80,
        "match_reasons": [{"factor": "topic_alignment", "points": 20, "why": "cs"}],
        "sources": [{"source": "usenix", "source_url": "https://example.com/conf"}],
        "funding_rows": [],
        "deadline_rows": [],
        "saved": False,
        "saved_at": None,
        "tracking_status": None,
        "tracking_updated_at": None,
        "created_at": now,
        "updated_at": now,
    }
    data.update(overrides)
    return SimpleNamespace(**data)


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    import api as api_module

    monkeypatch.setattr(api_module, "create_database", lambda: None)
    return TestClient(api_module.app)


def test_list_default_and_recommended(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import conferences_api as module

    row = _row()
    monkeypatch.setattr(
        module,
        "get_conferences",
        lambda *args, **kwargs: ([row], 1),
    )
    res = client.get("/api/conferences")
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 1
    assert body["conferences"][0]["name"] == "US Undergrad Conf"
    rec = client.get("/api/conferences/recommended")
    assert rec.status_code == 200


def test_filters_match_score_and_funding(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import conferences_api as module

    captured: dict = {}

    def fake_get(*args, **kwargs):
        captured.update(kwargs)
        return [], 0

    monkeypatch.setattr(module, "get_conferences", fake_get)
    res = client.get(
        "/api/conferences",
        params={
            "match_score": 50,
            "funding_available": True,
            "travel_grant_available": True,
            "topic": "ml",
            "search": "neurips",
            "eligibility": "ELIGIBLE",
        },
    )
    assert res.status_code == 200
    assert captured["min_match_score"] == 50
    assert captured["funding_available"] is True
    assert captured["travel_grant_available"] is True
    assert captured["topic"] == "ml"
    assert captured["search"] == "neurips"
    assert captured["eligibility"] == "ELIGIBLE"


def test_detail_404(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    import conferences_api as module

    monkeypatch.setattr(module, "get_conference_by_id", lambda db, cid: None)
    res = client.get(f"/api/conferences/{uuid.uuid4()}")
    assert res.status_code == 404


def test_eligibility_breakdown(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import conferences_api as module

    monkeypatch.setattr(
        module,
        "get_eligibility_breakdown",
        lambda *args, **kwargs: {
            "ELIGIBLE": 2,
            "LIKELY_ELIGIBLE": 1,
            "NEEDS_VERIFICATION": 3,
            "NOT_ELIGIBLE": 4,
        },
    )
    monkeypatch.setattr(module, "get_conferences", lambda *args, **kwargs: ([], 0))
    res = client.get("/api/conferences/eligibility")
    assert res.status_code == 200
    assert res.json()["counts"]["NOT_ELIGIBLE"] == 4


def test_new_filters_forwarded(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import conferences_api as module

    captured: dict = {}

    def fake_get(*args, **kwargs):
        captured.update(kwargs)
        return [], 0

    monkeypatch.setattr(module, "get_conferences", fake_get)
    res = client.get(
        "/api/conferences",
        params={
            "location_status": "US",
            "deadline": "this_month",
            "funding_eligibility": "ELIGIBLE",
            "scholarship_available": True,
            "source": "community",
            "saved": True,
            "tracking_status": "interested",
        },
    )
    assert res.status_code == 200
    assert captured["location_status"] == "US"
    assert captured["deadline"] == "this_month"
    assert captured["funding_eligibility"] == "ELIGIBLE"
    assert captured["scholarship_available"] is True
    assert captured["source"] == "community"
    assert captured["saved"] is True
    assert captured["tracking_status"] == "interested"


def test_stats_endpoint(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import conferences_api as module

    monkeypatch.setattr(
        module,
        "get_conference_stats",
        lambda *args, **kwargs: {
            "recommended": 24,
            "with_funding": 9,
            "travel_grants": 5,
            "deadlines_this_month": 3,
        },
    )
    res = client.get("/api/conferences/stats")
    assert res.status_code == 200
    body = res.json()
    assert body["recommended"] == 24
    assert body["with_funding"] == 9
    assert body["travel_grants"] == 5
    assert body["deadlines_this_month"] == 3


def test_patch_saved_and_tracking(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import conferences_api as module

    row = _row(saved=True, tracking_status="interested")
    monkeypatch.setattr(module, "set_conference_saved", lambda db, cid, saved: row)
    monkeypatch.setattr(
        module, "set_conference_tracking", lambda db, cid, status: row
    )
    saved = client.patch(
        f"/api/conferences/{row.id}/saved", json={"saved": True}
    )
    assert saved.status_code == 200
    assert saved.json()["saved"] is True

    tracking = client.patch(
        f"/api/conferences/{row.id}/tracking", json={"status": "interested"}
    )
    assert tracking.status_code == 200
    assert tracking.json()["tracking_status"] == "interested"

    bad = client.patch(
        f"/api/conferences/{row.id}/tracking", json={"status": "nope"}
    )
    assert bad.status_code == 422


def test_deadline_filter_this_month_and_next_3() -> None:
    from datetime import date, timedelta
    from types import SimpleNamespace

    from database.conference_crud import _matches_deadline_filter

    today = date.today()
    this_month = SimpleNamespace(
        call_for_papers_deadline=today + timedelta(days=2),
        paper_submission_deadline=None,
        abstract_deadline=None,
        registration_deadline=None,
        student_registration_deadline=None,
        funding_deadline=None,
        application_deadline=None,
        deadline_rows=[],
    )
    later = SimpleNamespace(
        call_for_papers_deadline=today + timedelta(days=60),
        paper_submission_deadline=None,
        abstract_deadline=None,
        registration_deadline=None,
        student_registration_deadline=None,
        funding_deadline=None,
        application_deadline=None,
        deadline_rows=[],
    )
    assert _matches_deadline_filter(this_month, "this_month", today=today)
    assert not _matches_deadline_filter(later, "this_month", today=today)
    assert _matches_deadline_filter(later, "next_3_months", today=today)
    assert _matches_deadline_filter(this_month, "closing_soon", today=today)
