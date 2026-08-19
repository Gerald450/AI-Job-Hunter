"""Undergraduate, graduation, and citizenship eligibility tests."""

from __future__ import annotations

from datetime import date

from model.conference import EligibilityStatus
from processors.conferences.eligibility import (
    evaluate_citizenship,
    evaluate_funding,
    evaluate_undergraduate,
)
from model.conference import ConferenceFunding, FundingKind
from processors.conferences.normalize import normalize_conference
from processors.conferences.eligibility import evaluate_conference
from processors.conferences.feed import passes_default_feed, should_persist_conference


PROFILE = {
    "country": "United States",
    "graduation_date": date(2027, 5, 31),
    "has_accepted_paper": False,
    "degree_level": "undergraduate",
}


def test_undergraduate_open() -> None:
    status, student, under, _ = evaluate_undergraduate(
        "Open to undergraduate students",
        start_date=date(2026, 12, 1),
        graduation_date=PROFILE["graduation_date"],
    )
    assert status == EligibilityStatus.ELIGIBLE
    assert student is True
    assert under is True


def test_undergraduate_and_graduate() -> None:
    status, _, under, grad = evaluate_undergraduate(
        "Open to undergraduate and graduate students",
        start_date=date(2026, 6, 1),
        graduation_date=PROFILE["graduation_date"],
    )
    assert status == EligibilityStatus.ELIGIBLE
    assert under is True
    assert grad is True


def test_graduate_only_rejected() -> None:
    status, _, under, grad = evaluate_undergraduate(
        "Must be a graduate student",
        start_date=date(2026, 6, 1),
        graduation_date=PROFILE["graduation_date"],
    )
    assert status == EligibilityStatus.NOT_ELIGIBLE
    assert under is False
    assert grad is True


def test_student_without_level_needs_verification() -> None:
    status, student, under, _ = evaluate_undergraduate(
        "Open to students currently enrolled",
        start_date=date(2026, 6, 1),
        graduation_date=PROFILE["graduation_date"],
    )
    assert status == EligibilityStatus.NEEDS_VERIFICATION
    assert student is True
    assert under is None


def test_enrolled_through_2028() -> None:
    status, *_ = evaluate_undergraduate(
        "Must be enrolled through 2028",
        start_date=date(2026, 6, 1),
        graduation_date=PROFILE["graduation_date"],
    )
    assert status == EligibilityStatus.NOT_ELIGIBLE


def test_conference_after_graduation() -> None:
    status, *_ = evaluate_undergraduate(
        "Must be enrolled at the time of the conference",
        start_date=date(2027, 8, 1),
        graduation_date=PROFILE["graduation_date"],
    )
    assert status == EligibilityStatus.NOT_ELIGIBLE


def test_conference_before_graduation_ok() -> None:
    status, _, under, _ = evaluate_undergraduate(
        "Open to undergraduate students. Must be enrolled at the time of the conference.",
        start_date=date(2027, 5, 15),
        graduation_date=PROFILE["graduation_date"],
    )
    assert status == EligibilityStatus.ELIGIBLE
    assert under is True


def test_citizenship_open() -> None:
    status, _ = evaluate_citizenship("Open to all students regardless of citizenship")
    assert status == EligibilityStatus.ELIGIBLE


def test_us_citizenship_required_is_not_eligible() -> None:
    status, matched = evaluate_citizenship("Must be a U.S. citizen")
    assert status == EligibilityStatus.NOT_ELIGIBLE
    assert matched

    status, _ = evaluate_citizenship("US citizenship required")
    assert status == EligibilityStatus.NOT_ELIGIBLE

    status, _ = evaluate_citizenship("U.S. citizens only")
    assert status == EligibilityStatus.NOT_ELIGIBLE


def test_us_citizen_conference_excluded_from_default_feed() -> None:
    conf = normalize_conference(
        {
            "name": "Defense Conf",
            "location": "Arlington, VA",
            "official_url": "https://example.com/defense",
            "source": "test",
            "eligibility_requirements": (
                "Open to undergraduate students. Must be a U.S. citizen."
            ),
        }
    )
    evaluate_conference(conf, PROFILE)
    assert conf.citizenship_status == EligibilityStatus.NOT_ELIGIBLE
    assert conf.eligibility_status == EligibilityStatus.NOT_ELIGIBLE
    assert passes_default_feed(conf) is False


def test_citizenship_mismatch_canada() -> None:
    status, _ = evaluate_citizenship("Must be a citizen of Canada")
    assert status == EligibilityStatus.NOT_ELIGIBLE


def test_no_citizenship_requirement() -> None:
    status, _ = evaluate_citizenship("Undergraduate students in computer science")
    assert status == EligibilityStatus.ELIGIBLE


def test_funding_paper_requirement() -> None:
    grant = ConferenceFunding(
        name="XYZ Student Travel Grant",
        kind=FundingKind.TRAVEL_GRANT,
        requirements_text=(
            "Available to undergraduate and graduate students presenting "
            "accepted research papers."
        ),
        paper_required=True,
    )
    status = evaluate_funding(
        grant,
        graduation_date=PROFILE["graduation_date"],
        start_date=date(2026, 12, 1),
        has_accepted_paper=False,
        profile_country="United States",
    )
    assert status == EligibilityStatus.NEEDS_VERIFICATION


def test_default_feed_excludes_non_us_and_not_eligible() -> None:
    us = normalize_conference(
        {
            "name": "US Conf",
            "location": "Austin, TX",
            "official_url": "https://example.com/us",
            "source": "test",
            "eligibility_requirements": "Open to undergraduate students",
            "funding_available": True,
        }
    )
    evaluate_conference(us, PROFILE)
    london = normalize_conference(
        {
            "name": "London Conf",
            "location": "London, UK",
            "official_url": "https://example.com/uk",
            "source": "test",
            "eligibility_requirements": "Open to undergraduate students",
            "funding_available": True,
        }
    )
    evaluate_conference(london, PROFILE)
    grad_only = normalize_conference(
        {
            "name": "Grad Conf",
            "location": "Boston, MA",
            "official_url": "https://example.com/grad",
            "source": "test",
            "eligibility_requirements": "Must be a graduate student",
            "funding_available": True,
        }
    )
    evaluate_conference(grad_only, PROFILE)
    unknown = normalize_conference(
        {
            "name": "Mystery Conf",
            "official_url": "https://example.com/mystery",
            "source": "test",
            "funding_available": True,
        }
    )
    evaluate_conference(unknown, PROFILE)

    assert passes_default_feed(us) is True
    assert passes_default_feed(london) is False
    assert passes_default_feed(grad_only) is False
    assert passes_default_feed(unknown) is False
    assert passes_default_feed(unknown, include_unknown_locations=True) is True


def test_persist_requires_in_person_funding() -> None:
    funded_us = normalize_conference(
        {
            "name": "Funded US",
            "location": "Austin, TX",
            "official_url": "https://example.com/funded",
            "source": "test",
            "funding_available": True,
        }
    )
    online = normalize_conference(
        {
            "name": "Online Conf",
            "location": "Online",
            "is_virtual": True,
            "official_url": "https://example.com/online",
            "source": "test",
            "funding_available": True,
        }
    )
    unfunded = normalize_conference(
        {
            "name": "Unfunded US",
            "location": "Austin, TX",
            "official_url": "https://example.com/unfunded",
            "source": "test",
        }
    )
    past = normalize_conference(
        {
            "name": "Past US",
            "location": "Austin, TX",
            "official_url": "https://example.com/past",
            "source": "test",
            "funding_available": True,
            "start_date": "2025-06-01",
            "end_date": "2025-06-05",
        }
    )
    ongoing = normalize_conference(
        {
            "name": "Ongoing US",
            "location": "Austin, TX",
            "official_url": "https://example.com/ongoing",
            "source": "test",
            "funding_available": True,
            "start_date": "2026-08-01",
            "end_date": "2026-08-30",
        }
    )
    assert should_persist_conference(funded_us) is True
    assert should_persist_conference(online) is False
    assert should_persist_conference(unfunded) is False
    assert should_persist_conference(past) is False
    assert should_persist_conference(ongoing) is True
    assert passes_default_feed(online) is False
    assert passes_default_feed(unfunded) is False
    assert passes_default_feed(past) is False
