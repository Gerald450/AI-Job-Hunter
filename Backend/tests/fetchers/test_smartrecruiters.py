"""Tests for SmartRecruitersFetcher."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from fetchers.exceptions import FetchError
from fetchers.smartrecruiters import SmartRecruitersFetcher


def _mock_response(
    status_code: int,
    payload: dict | list | None = None,
    *,
    url: str = "https://api.smartrecruiters.com/v1/companies/AcmeCorp/postings/1",
) -> MagicMock:
    response = MagicMock(spec=httpx.Response)
    response.status_code = status_code
    response.url = url
    response.json.return_value = payload
    return response


@pytest.mark.parametrize(
    ("url", "company", "posting_id"),
    [
        (
            "https://jobs.smartrecruiters.com/AcmeCorp/0552caa6-96df-40c6-8c9d-642c7ef67a1c",
            "AcmeCorp",
            "0552caa6-96df-40c6-8c9d-642c7ef67a1c",
        ),
        (
            "https://www.smartrecruiters.com/AcmeCorp/107099726-maintenance-mechanic",
            "AcmeCorp",
            "107099726",
        ),
        (
            "https://jobs.smartrecruiters.com/Stripe/999888777",
            "Stripe",
            "999888777",
        ),
    ],
)
def test_parse_smartrecruiters_url_formats(
    url: str,
    company: str,
    posting_id: str,
) -> None:
    fetcher = SmartRecruitersFetcher()
    assert fetcher._parse_smartrecruiters_url(url) == (company, posting_id)


@pytest.mark.parametrize(
    "url",
    [
        "https://jobs.smartrecruiters.com/AcmeCorp",
        "https://jobs.smartrecruiters.com/",
        "https://example.com/AcmeCorp/123",
    ],
)
def test_parse_smartrecruiters_url_malformed(url: str) -> None:
    fetcher = SmartRecruitersFetcher()
    with pytest.raises(FetchError):
        fetcher._parse_smartrecruiters_url(url)


@pytest.mark.asyncio
async def test_smartrecruiters_fetch_success(smartrecruiters_payload: dict) -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get.return_value = _mock_response(200, smartrecruiters_payload)

    fetcher = SmartRecruitersFetcher(client=client)
    result = await fetcher.fetch(
        "https://www.smartrecruiters.com/AcmeCorp/107099726-maintenance-mechanic"
    )

    assert result.source == "smartrecruiters"
    assert result.title == "Maintenance Mechanic"
    assert result.company == "Acme Corp"
    assert "Fix machines." in result.description
    assert "- 2 years experience" in result.description
    assert "Benefits included." in result.description
    client.get.assert_awaited_once()
    called_url = client.get.await_args.args[0]
    assert called_url.endswith("/companies/AcmeCorp/postings/107099726")


@pytest.mark.asyncio
async def test_smartrecruiters_api_failure() -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get.return_value = _mock_response(502, {"error": "bad gateway"})

    fetcher = SmartRecruitersFetcher(client=client)
    with pytest.raises(FetchError, match="API request failed"):
        await fetcher.fetch(
            "https://jobs.smartrecruiters.com/AcmeCorp/"
            "0552caa6-96df-40c6-8c9d-642c7ef67a1c"
        )


@pytest.mark.asyncio
async def test_smartrecruiters_job_not_found() -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get.return_value = _mock_response(404, {"error": "missing"})

    fetcher = SmartRecruitersFetcher(client=client)
    with pytest.raises(FetchError, match="not found"):
        await fetcher.fetch(
            "https://jobs.smartrecruiters.com/AcmeCorp/"
            "0552caa6-96df-40c6-8c9d-642c7ef67a1c"
        )
