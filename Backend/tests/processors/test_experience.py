"""Tests for years-of-experience requirement detection."""

from __future__ import annotations

from processors.early_career import is_early_career
from processors.experience import (
    exceeds_max_years,
    extract_min_years_required,
)
from processors.normalize import normalize_job


def test_extract_five_plus_years_product_management() -> None:
    text = (
        "You Have:\n"
        "* 5+ years of Product Management experience, with at least 2 years "
        "working on consumer-facing growth\n"
    )
    assert extract_min_years_required(text) == 5.0
    assert exceeds_max_years(5.0, max_years=2) is True


def test_extract_allows_zero_to_two_years() -> None:
    assert extract_min_years_required("0-2 years of experience") == 0.0
    assert extract_min_years_required("1+ years of experience") == 1.0
    assert extract_min_years_required("2 years of experience") == 2.0
    assert exceeds_max_years(2.0, max_years=2) is False
    assert exceeds_max_years(3.0, max_years=2) is True


def test_extract_ignores_unrelated_year_mentions() -> None:
    assert extract_min_years_required("Competitive salary and benefits.") is None
    assert extract_min_years_required("Founded 10 years ago in San Francisco.") is None


def test_sr_product_manager_title_rejected() -> None:
    assert is_early_career("Sr. Product Manager, Community") is False
    assert is_early_career("Senior Product Manager") is False
    assert is_early_career("Product Manager") is True
    assert is_early_career("Associate Product Manager") is True


def test_normalize_flags_twitch_style_senior_jd() -> None:
    job = normalize_job(
        {
            "company": "Twitch",
            "role": "Product Manager, Community",
            "location": "San Francisco, CA",
            "apply_url": "https://job-boards.greenhouse.io/twitch/jobs/8687988002",
            "age": "1d",
            "source": "greenhouse",
            "description": (
                "You Have:\n"
                "* 5+ years of Product Management experience, with at least "
                "2 years working on consumer-facing growth, engagement, or "
                "notifications products\n"
            ),
        }
    )
    assert job.min_years_required == 5.0
