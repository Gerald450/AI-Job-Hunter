"""Tests for US location filtering."""

from __future__ import annotations

from processors.location import has_us_signal, is_us_location


def test_us_city_state() -> None:
    assert is_us_location("San Jose, CA")
    assert is_us_location("Austin, TX")
    assert is_us_location("New York, NY, USA")
    assert is_us_location("Seattle, Washington")


def test_us_country_and_remote() -> None:
    assert is_us_location("United States")
    assert is_us_location("Remote in USA")
    assert is_us_location("Remote")
    assert is_us_location("US Remote")


def test_us_city_tags() -> None:
    assert is_us_location("SF")
    assert is_us_location("NYC")
    assert is_us_location("SF NYC")
    assert is_us_location("5 locations Seattle, WA SF LA NYC Sunnyvale, CA")


def test_non_us_rejected() -> None:
    assert not is_us_location("London, UK")
    assert not is_us_location("Toronto, Canada")
    assert not is_us_location("Berlin, Germany")
    assert not is_us_location("Bangalore, India")
    assert not is_us_location("Paris, France")
    assert not is_us_location("Singapore")


def test_mixed_locations_kept_when_us_present() -> None:
    assert is_us_location("NYC / Toronto, Canada")
    assert is_us_location("Remote in USA; London, UK")


def test_empty_unknown_rejected() -> None:
    assert not is_us_location("")
    assert not is_us_location(None)
    assert not is_us_location("Unknown")
    assert not is_us_location("n/a")


def test_has_us_signal_helpers() -> None:
    assert has_us_signal("Mountain View, CA")
    assert not has_us_signal("London, UK")
