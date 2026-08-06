"""Tests for the deterministic Sponsorship Detection Engine."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from fetchers.base import JobDescription
from sponsorship.detector import SponsorshipDetector, normalize_description
from sponsorship.models import SponsorshipResult
from sponsorship.service import SponsorshipService


@pytest.fixture
def detector() -> SponsorshipDetector:
    return SponsorshipDetector()


# ---------------------------------------------------------------------------
# Explicit sponsorship available
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "text",
    [
        "Visa sponsorship available for this role.",
        "H-1B sponsorship available.",
        "H1B sponsorship available to qualified candidates.",
        "Employment sponsorship available.",
        "Immigration sponsorship available.",
        "We sponsor visas for exceptional talent.",
        "We provide visa sponsorship.",
        "Candidates are eligible for sponsorship.",
        "Sponsorship available.",
        "We support work authorization sponsorship.",
        "The company will sponsor qualified applicants.",
    ],
)
def test_explicit_sponsorship_available(
    detector: SponsorshipDetector, text: str
) -> None:
    result = detector.detect(text)
    assert result.sponsorship is True
    assert result.confidence == 1.0
    assert result.matched_phrase
    assert isinstance(result.matched_phrase, str)


# ---------------------------------------------------------------------------
# Explicit sponsorship unavailable
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "text",
    [
        "No sponsorship.",
        "No visa sponsorship for this position.",
        "Visa sponsorship is not available.",
        "This position is not eligible for visa sponsorship.",
        "Employer will not sponsor.",
        "We will not sponsor visas.",
        "We cannot sponsor work authorization.",
        "Unable to sponsor at this time.",
        "No immigration sponsorship.",
        "Sponsorship is unavailable.",
        "Must be legally authorized to work.",
        "Must have unrestricted work authorization.",
        "Must possess unrestricted work authorization.",
        (
            "Must be authorized to work in the United States "
            "without sponsorship."
        ),
        "No H-1B sponsorship.",
        "Not eligible for employment sponsorship.",
        "US work authorization required.",
        "U.S. work authorization required.",
    ],
)
def test_explicit_sponsorship_unavailable(
    detector: SponsorshipDetector, text: str
) -> None:
    result = detector.detect(text)
    assert result.sponsorship is False
    assert result.confidence == 1.0
    assert result.matched_phrase


# ---------------------------------------------------------------------------
# Wording / regex variations
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("We won't sponsor any candidates.", False),
        ("We wont sponsor any candidates.", False),
        ("The firm does not sponsor visas.", False),
        ("The firm doesn't sponsor visas.", False),
        ("Can not sponsor H-1B at this time.", False),
        ("Not able to sponsor immigration cases.", False),
        ("Sponsorship not available for contractors.", False),
        ("No visa support is offered.", False),
        ("Must already be authorized to work in the US.", False),
        ("Applicants must be authorized to work.", False),
        ("We will sponsor H-1B visas.", True),
        ("Eligible for visa sponsorship upon hire.", True),
        ("Company sponsors H-1B petitions.", True),
        ("Acme sponsors visas for new grads.", True),
    ],
)
def test_wording_variations(
    detector: SponsorshipDetector, text: str, expected: bool
) -> None:
    result = detector.detect(text)
    assert result.sponsorship is expected
    assert result.confidence == 1.0


def test_no_patterns_take_priority_over_yes_substrings(
    detector: SponsorshipDetector,
) -> None:
    """Denials that contain affirmative-looking substrings must stay False."""
    result = detector.detect("No sponsorship available for this role.")
    assert result.sponsorship is False
    assert result.confidence == 1.0

    result = detector.detect(
        "Candidates are not eligible for visa sponsorship."
    )
    assert result.sponsorship is False

    result = detector.detect("We will not sponsor work visas.")
    assert result.sponsorship is False


# ---------------------------------------------------------------------------
# Capitalization & whitespace
# ---------------------------------------------------------------------------


def test_capitalization_differences(detector: SponsorshipDetector) -> None:
    lower = detector.detect("visa sponsorship available")
    upper = detector.detect("VISA SPONSORSHIP AVAILABLE")
    mixed = detector.detect("Visa Sponsorship Available")
    assert lower == upper == mixed
    assert lower.sponsorship is True


def test_whitespace_differences(detector: SponsorshipDetector) -> None:
    compact = detector.detect("no visa sponsorship")
    spaced = detector.detect("no   visa\n\nsponsorship")
    assert compact.sponsorship is False
    assert spaced.sponsorship is False
    assert spaced.matched_phrase == "no visa sponsorship"


def test_normalize_description_collapses_whitespace() -> None:
    assert normalize_description("  Hello\n\tWorld  ") == "hello world"
    assert normalize_description("") == ""


# ---------------------------------------------------------------------------
# No information / empty
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "text",
    [
        "We are hiring software engineers in New York.",
        "Competitive salary and benefits package.",
        "Remote-friendly culture with great teammates.",
        "Requires 2 years of Python experience.",
    ],
)
def test_no_sponsorship_information(
    detector: SponsorshipDetector, text: str
) -> None:
    result = detector.detect(text)
    assert result == SponsorshipResult(
        sponsorship=None,
        matched_phrase=None,
        confidence=0.0,
    )


@pytest.mark.parametrize("text", ["", "   ", "\n\t", None])
def test_empty_descriptions(detector: SponsorshipDetector, text: str | None) -> None:
    result = detector.detect(text)
    assert result.sponsorship is None
    assert result.matched_phrase is None
    assert result.confidence == 0.0


# ---------------------------------------------------------------------------
# Matched phrase & confidence contract
# ---------------------------------------------------------------------------


def test_matched_phrase_is_exact_substring(
    detector: SponsorshipDetector,
) -> None:
    text = "Please note: this position is not eligible for visa sponsorship. Apply today."
    result = detector.detect(text)
    assert result.sponsorship is False
    assert result.matched_phrase == "this position is not eligible for visa sponsorship"
    assert result.matched_phrase in normalize_description(text)


def test_confidence_is_binary(detector: SponsorshipDetector) -> None:
    assert detector.detect("sponsorship available").confidence == 1.0
    assert detector.detect("no sponsorship").confidence == 1.0
    assert detector.detect("great benefits").confidence == 0.0


# ---------------------------------------------------------------------------
# Service persistence
# ---------------------------------------------------------------------------


def test_service_apply_result_sets_fields_and_syncs_no_sponsorship() -> None:
    service = SponsorshipService()
    job = MagicMock()
    job.id = "abc123"
    job.no_sponsorship = False

    denied = SponsorshipResult(
        sponsorship=False,
        matched_phrase="will not sponsor",
        confidence=1.0,
    )
    service.apply_result(job, denied)
    assert job.sponsorship_available is False
    assert job.sponsorship_match == "will not sponsor"
    assert job.sponsorship_confidence == 1.0
    assert job.no_sponsorship is True

    offered = SponsorshipResult(
        sponsorship=True,
        matched_phrase="visa sponsorship available",
        confidence=1.0,
    )
    service.apply_result(job, offered)
    assert job.sponsorship_available is True
    assert job.no_sponsorship is False

    unknown = SponsorshipResult(
        sponsorship=None,
        matched_phrase=None,
        confidence=0.0,
    )
    job.no_sponsorship = True
    service.apply_result(job, unknown)
    # Unknown must not clear list-source no_sponsorship flags.
    assert job.no_sponsorship is True
    assert job.sponsorship_available is None


@pytest.mark.asyncio
async def test_service_enrich_from_url_uses_router(monkeypatch: pytest.MonkeyPatch) -> None:
    service = SponsorshipService()
    job = MagicMock()
    job.id = "job-1"
    job.apply_url = "https://boards.greenhouse.io/acme/jobs/1"
    job.no_sponsorship = False

    router = MagicMock()

    async def fake_fetch(url: str) -> JobDescription:
        assert url == job.apply_url
        return JobDescription(
            description="Visa sponsorship available for new grads.",
            source="greenhouse",
            url=url,
        )

    router.fetch = fake_fetch

    db = MagicMock()
    result = await service.enrich_from_url(db, job, router=router)

    assert result.sponsorship is True
    assert job.sponsorship_available is True
    db.commit.assert_called_once()
    db.refresh.assert_called_once_with(job)
