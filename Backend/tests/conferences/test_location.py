"""Tests for conference location classification."""

from __future__ import annotations

from processors.location import (
    classify_conference_location,
    is_us_location,
    is_virtual_location,
    parse_location_parts,
)


def test_us_conference_city_state() -> None:
    assert classify_conference_location("New York, NY, USA") == "US"
    assert classify_conference_location("San Diego, CA") == "US"
    assert classify_conference_location("Santa Clara, CA (USA)") == "US"


def test_us_territory() -> None:
    assert classify_conference_location("San Juan, Puerto Rico") == "US"


def test_non_us_rejected() -> None:
    assert classify_conference_location("London, UK") == "NON_US"
    assert classify_conference_location("Vancouver (Canada)") == "NON_US"
    assert classify_conference_location("Berlin, Germany") == "NON_US"


def test_virtual_accepted() -> None:
    assert classify_conference_location("Online") == "VIRTUAL"
    assert classify_conference_location("Virtual") == "VIRTUAL"
    assert classify_conference_location(None, is_virtual=True) == "VIRTUAL"
    assert classify_conference_location("Remote") == "VIRTUAL"


def test_unknown_location() -> None:
    assert classify_conference_location(None) == "UNKNOWN"
    assert classify_conference_location("") == "UNKNOWN"
    assert classify_conference_location("Unknown") == "UNKNOWN"
    assert classify_conference_location("TBD") == "UNKNOWN"


def test_org_is_not_location() -> None:
    assert classify_conference_location("ACM") == "UNKNOWN"
    assert classify_conference_location("IEEE") == "UNKNOWN"


def test_job_us_location_unchanged() -> None:
    assert is_us_location("Remote") is True
    assert is_virtual_location("Remote") is True


def test_parse_location_parts_us() -> None:
    city, state, country = parse_location_parts("Austin, TX")
    assert city == "Austin"
    assert state == "TX"
    assert country == "United States"
