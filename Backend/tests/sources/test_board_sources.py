"""Tests for ATS board listing sources."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from sources.ashby import AshbyBoardSource
from sources.greenhouse import GreenhouseBoardSource
from sources.lever import LeverBoardSource


@pytest.mark.asyncio
async def test_greenhouse_board_maps_jobs():
    companies = [{"name": "Acme", "ats": "greenhouse", "board_token": "acme", "enabled": True}]
    payload = {
        "jobs": [
            {
                "id": 101,
                "title": "Software Engineer New Grad",
                "absolute_url": "https://boards.greenhouse.io/acme/jobs/101",
                "location": {"name": "San Francisco, CA"},
                "first_published": "2026-08-01T12:00:00-04:00",
            },
            {
                "id": 102,
                "title": "Senior Staff Engineer",
                "absolute_url": "https://boards.greenhouse.io/acme/jobs/102",
                "location": {"name": "Remote"},
                "updated_at": "2026-08-05T12:00:00-04:00",
            },
        ]
    }
    source = GreenhouseBoardSource(companies)
    with patch("sources.greenhouse.http_get_json", new=AsyncMock(return_value=payload)):
        jobs = await source.fetch_jobs()

    assert len(jobs) == 2
    assert jobs[0].company == "Acme"
    assert jobs[0].external_id == "101"
    assert jobs[0].ats == "greenhouse"
    assert jobs[0].apply_url.endswith("/101")
    assert jobs[0].age != "unknown"


@pytest.mark.asyncio
async def test_greenhouse_board_rewrites_stripe_search_url():
    companies = [
        {"name": "Stripe", "ats": "greenhouse", "board_token": "stripe", "enabled": True}
    ]
    payload = {
        "jobs": [
            {
                "id": 8107379,
                "title": "Software Engineer",
                "absolute_url": "https://stripe.com/jobs/search?gh_jid=8107379",
                "location": {"name": "South San Francisco, CA"},
                "first_published": "2026-08-01T12:00:00-04:00",
            },
        ]
    }
    source = GreenhouseBoardSource(companies)
    with patch("sources.greenhouse.http_get_json", new=AsyncMock(return_value=payload)):
        jobs = await source.fetch_jobs()

    assert len(jobs) == 1
    assert jobs[0].apply_url == (
        "https://stripe.com/jobs/listing/software-engineer/8107379"
    )


@pytest.mark.asyncio
async def test_ashby_board_maps_jobs():
    companies = [{"name": "Cursor", "ats": "ashby", "board_token": "cursor", "enabled": True}]
    payload = {
        "jobs": [
            {
                "id": "abc-123",
                "title": "Software Engineer",
                "jobUrl": "https://jobs.ashbyhq.com/cursor/abc-123",
                "location": "New York, NY",
                "publishedAt": "2026-08-01T12:00:00.000+00:00",
            }
        ]
    }
    source = AshbyBoardSource(companies)
    with patch("sources.ashby.http_get_json", new=AsyncMock(return_value=payload)):
        jobs = await source.fetch_jobs()

    assert len(jobs) == 1
    assert jobs[0].external_id == "abc-123"
    assert jobs[0].ats == "ashby"
    assert "ashbyhq.com" in jobs[0].apply_url


@pytest.mark.asyncio
async def test_lever_board_maps_jobs():
    companies = [{"name": "Netflix", "ats": "lever", "board_token": "netflix", "enabled": True}]
    payload = [
        {
            "id": "post-1",
            "text": "New Grad Software Engineer",
            "hostedUrl": "https://jobs.lever.co/netflix/post-1",
            "categories": {"location": "Los Gatos, CA"},
        }
    ]
    source = LeverBoardSource(companies)
    with patch("sources.lever.http_get_json", new=AsyncMock(return_value=payload)):
        jobs = await source.fetch_jobs()

    assert len(jobs) == 1
    assert jobs[0].company == "Netflix"
    assert jobs[0].external_id == "post-1"
    assert jobs[0].ats == "lever"


@pytest.mark.asyncio
async def test_greenhouse_isolates_company_failures():
    companies = [
        {"name": "Good", "ats": "greenhouse", "board_token": "good", "enabled": True},
        {"name": "Bad", "ats": "greenhouse", "board_token": "bad", "enabled": True},
    ]
    good_payload = {
        "jobs": [
            {
                "id": 1,
                "title": "Software Engineer",
                "absolute_url": "https://boards.greenhouse.io/good/jobs/1",
                "location": {"name": "Austin, TX"},
            }
        ]
    }

    async def fake_get(url, **kwargs):
        if "/bad/" in url:
            raise RuntimeError("boom")
        return good_payload

    source = GreenhouseBoardSource(companies)
    with patch("sources.greenhouse.http_get_json", new=AsyncMock(side_effect=fake_get)):
        jobs = await source.fetch_jobs()

    assert len(jobs) == 1
    assert jobs[0].company == "Good"
