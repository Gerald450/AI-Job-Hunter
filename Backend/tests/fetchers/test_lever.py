"""Tests for LeverFetcher."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from fetchers.exceptions import FetchError
from fetchers.lever import LeverFetcher


def _mock_response(
    status_code: int,
    payload: dict | list | None = None,
    *,
    url: str = "https://api.lever.co/v0/postings/acme/abc-def",
) -> MagicMock:
    response = MagicMock(spec=httpx.Response)
    response.status_code = status_code
    response.url = url
    response.json.return_value = payload
    return response


@pytest.mark.parametrize(
    ("url", "company", "posting_id", "use_eu"),
    [
        ("https://jobs.lever.co/acme/abc-def", "acme", "abc-def", False),
        ("https://jobs.eu.lever.co/acme/xyz-999", "acme", "xyz-999", True),
        (
            "https://jobs.lever.co/ramp/NDg1NzYwMzEtNTk1Yg",
            "ramp",
            "NDg1NzYwMzEtNTk1Yg",
            False,
        ),
    ],
)
def test_parse_lever_url_formats(
    url: str,
    company: str,
    posting_id: str,
    use_eu: bool,
) -> None:
    fetcher = LeverFetcher()
    assert fetcher._parse_lever_url(url) == (company, posting_id, use_eu)


@pytest.mark.parametrize(
    "url",
    [
        "https://jobs.lever.co/acme",
        "https://jobs.lever.co/",
        "https://example.com/acme/abc",
    ],
)
def test_parse_lever_url_malformed(url: str) -> None:
    fetcher = LeverFetcher()
    with pytest.raises(FetchError):
        fetcher._parse_lever_url(url)


@pytest.mark.asyncio
async def test_lever_fetch_success(lever_payload: dict) -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get.return_value = _mock_response(200, lever_payload)

    fetcher = LeverFetcher(client=client)
    result = await fetcher.fetch("https://jobs.lever.co/acme/abc-def")

    assert result.source == "lever"
    assert result.title == "Backend Engineer"
    assert result.company == "acme"
    assert "Ship APIs." in result.description
    assert "Requirements" in result.description
    assert "- Go" in result.description
    client.get.assert_awaited_once()


@pytest.mark.asyncio
async def test_lever_retries_eu_on_us_404(lever_payload: dict) -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get.side_effect = [
        _mock_response(404, {"error": "missing"}),
        _mock_response(
            200,
            lever_payload,
            url="https://api.eu.lever.co/v0/postings/acme/abc-def",
        ),
    ]

    fetcher = LeverFetcher(client=client)
    result = await fetcher.fetch("https://jobs.lever.co/acme/abc-def")

    assert result.source == "lever"
    assert client.get.await_count == 2
    second_url = client.get.await_args_list[1].args[0]
    assert "api.eu.lever.co" in second_url


@pytest.mark.asyncio
async def test_lever_api_failure() -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get.return_value = _mock_response(503, {"error": "down"})

    fetcher = LeverFetcher(client=client)
    with pytest.raises(FetchError, match="API request failed"):
        await fetcher.fetch("https://jobs.lever.co/acme/abc-def")


@pytest.mark.asyncio
async def test_lever_job_not_found_both_regions() -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get.return_value = _mock_response(404, {"error": "missing"})

    fetcher = LeverFetcher(client=client)
    with pytest.raises(FetchError, match="not found"):
        await fetcher.fetch("https://jobs.lever.co/acme/abc-def")
