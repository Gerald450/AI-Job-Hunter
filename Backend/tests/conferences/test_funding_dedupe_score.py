"""Funding extraction, deadlines, dedupe, and match score tests."""

from __future__ import annotations

from datetime import date, timedelta

from model.conference import (
    EligibilityStatus,
    FundingKind,
    FundingStatus,
    LocationStatus,
)
from processors.conferences.dates import is_closing_soon, is_expired
from processors.conferences.dedupe import deduplicate
from processors.conferences.funding import extract_funding
from processors.conferences.matching import score_conference
from processors.conferences.normalize import normalize_conference


PROFILE = {
    "country": "United States",
    "graduation_date": date(2027, 5, 31),
    "has_accepted_paper": False,
    "match_weights": {
        "topic_alignment": 35,
        "undergraduate_eligible": 15,
        "us_or_virtual": 15,
        "student_funding": 15,
        "funding_likely_eligible": 10,
        "deadline_urgency": 10,
    },
}


def test_travel_grant_extraction() -> None:
    text = (
        "The XYZ Student Travel Grant provides up to $1,000 for airfare. "
        "Application deadline: March 15, 2026. Open to undergraduate students."
    )
    grants = extract_funding(text, conference_name="XYZ Conference")
    assert grants
    travel = [g for g in grants if g.kind == FundingKind.TRAVEL_GRANT]
    assert travel
    assert travel[0].amount == "$1,000"
    assert travel[0].deadline == date(2026, 3, 15)


def test_ignores_corporate_sponsor() -> None:
    text = "Gold sponsor: Acme Corp. This event is sponsored by Acme."
    grants = extract_funding(text, conference_name="XYZ")
    assert grants == []


def test_expired_and_multiple_deadlines() -> None:
    today = date(2026, 6, 1)
    cfp = date(2026, 1, 1)
    grant = date(2026, 6, 10)
    assert is_expired(cfp, today=today) is True
    assert is_expired(grant, today=today) is False
    assert is_closing_soon(grant, today=today, window_days=14) is True


def test_dedupe_github_and_official_url() -> None:
    community = normalize_conference(
        {
            "name": "NeurIPS 2026",
            "location": "San Diego, CA (USA)",
            "official_url": "https://neurips.cc/",
            "source": "awesome_ai",
            "source_url": "https://github.com/example/awesome",
        }
    )
    official = normalize_conference(
        {
            "name": "NeurIPS",
            "organization": "NeurIPS",
            "location": "San Diego, CA",
            "official_url": "https://www.neurips.cc/",
            "source": "neurips",
            "source_url": "https://neurips.cc/",
        }
    )
    merged, dupes = deduplicate([community, official])
    assert dupes == 1
    assert len(merged) == 1
    assert merged[0].source == "neurips"
    assert "neurips.cc" in (merged[0].official_url or "")
    sources = {item.source for item in merged[0].sources}
    assert "awesome_ai" in sources
    assert "neurips" in sources


def test_match_score_prefers_funded_undergrad() -> None:
    small = normalize_conference(
        {
            "name": "Systems Software Workshop",
            "location": "Austin, TX",
            "official_url": "https://example.com/small",
            "source": "test",
            "eligibility_requirements": "Open to undergraduate students",
            "funding_available": True,
            "funding_status": FundingStatus.FUNDING_AVAILABLE,
            "call_for_papers_deadline": date.today() + timedelta(days=10),
            "topics": ["systems", "software_engineering"],
        }
    )
    small.undergraduate_eligible = True
    small.eligibility_status = EligibilityStatus.ELIGIBLE
    small.funding_eligibility_status = EligibilityStatus.ELIGIBLE
    small.location_status = LocationStatus.US
    prestige = normalize_conference(
        {
            "name": "World Famous AI Gala",
            "location": "New York, NY",
            "official_url": "https://example.com/gala",
            "source": "test",
            "eligibility_requirements": "Open to undergraduate students",
            "funding_status": FundingStatus.NO_FUNDING_FOUND,
            "topics": ["artificial_intelligence"],
        }
    )
    prestige.undergraduate_eligible = True
    prestige.eligibility_status = EligibilityStatus.ELIGIBLE
    prestige.funding_eligibility_status = EligibilityStatus.NEEDS_VERIFICATION
    prestige.location_status = LocationStatus.US
    score_conference(small, PROFILE)
    score_conference(prestige, PROFILE)
    assert small.match_score > prestige.match_score
    assert small.match_reasons
