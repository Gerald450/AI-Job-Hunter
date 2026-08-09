"""Tests for max-age filtering."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from processors.age import (
    age_to_hours,
    datetime_to_age_string,
    is_within_max_age,
    parse_posted_at,
)


def test_age_to_hours_parses_units():
    assert age_to_hours("2d") == 48
    assert age_to_hours("1mo") == 24 * 30
    assert age_to_hours("unknown") is None


def test_is_within_max_age_from_age_string():
    assert is_within_max_age(age="15d", max_age_days=30) is True
    assert is_within_max_age(age="45d", max_age_days=30) is False
    assert is_within_max_age(age="1mo", max_age_days=30) is True
    assert is_within_max_age(age="2mo", max_age_days=30) is False


def test_is_within_max_age_from_posted_at():
    now = datetime(2026, 8, 6, tzinfo=timezone.utc)
    recent = now - timedelta(days=10)
    old = now - timedelta(days=40)
    assert is_within_max_age(posted_at=recent, max_age_days=30, now=now) is True
    assert is_within_max_age(posted_at=old, max_age_days=30, now=now) is False


def test_fallback_created_at_for_unknown_age():
    now = datetime(2026, 8, 6, tzinfo=timezone.utc)
    old = now - timedelta(days=40)
    assert (
        is_within_max_age(
            age="unknown",
            fallback_at=old,
            max_age_days=30,
            now=now,
        )
        is False
    )


def test_parse_posted_at_and_age_string():
    posted = parse_posted_at("2026-08-01T12:00:00+00:00")
    assert posted is not None
    age = datetime_to_age_string(
        posted, now=datetime(2026, 8, 6, 12, 0, tzinfo=timezone.utc)
    )
    assert age == "5d"
