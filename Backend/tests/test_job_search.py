"""Tests for job list search filters (company, source, max_age)."""

from typing import Optional

from database.crud import _matches_source, age_to_hours


class _FakeJob:
    def __init__(
        self,
        source="pittcsc",
        ats=None,  # type: Optional[str]
        apply_url=None,  # type: Optional[str]
    ):
        self.source = source
        self.ats = ats
        self.apply_url = apply_url


def test_age_to_hours_units():
    assert age_to_hours("5h") == 5
    assert age_to_hours("2d") == 48
    assert age_to_hours("1w") == 168
    assert age_to_hours("1mo") == 720


def test_max_age_comparison():
    assert age_to_hours("12h") <= age_to_hours("24h")
    assert age_to_hours("3d") <= age_to_hours("7d")
    assert age_to_hours("2mo") > age_to_hours("14d")


def test_matches_source_on_source_ats_and_url():
    assert _matches_source(_FakeJob(source="simplify"), "simp")
    assert _matches_source(_FakeJob(ats="greenhouse"), "Green")
    assert _matches_source(
        _FakeJob(apply_url="https://jobs.lever.co/acme/abc"),
        "lever",
    )
    assert not _matches_source(_FakeJob(source="pittcsc"), "ashby")
