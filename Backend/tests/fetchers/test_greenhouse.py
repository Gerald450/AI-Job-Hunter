"""Tests for GreenhouseFetcher."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from fetchers.exceptions import FetchError
from fetchers.greenhouse import GreenhouseFetcher


def _mock_response(
    status_code: int,
    payload: dict | list | None = None,
    *,
    url: str = "https://boards-api.greenhouse.io/v1/boards/acme/jobs/123456",
) -> MagicMock:
    response = MagicMock(spec=httpx.Response)
    response.status_code = status_code
    response.url = url
    response.json.return_value = payload
    return response


@pytest.mark.parametrize(
    ("url", "board", "job_id"),
    [
        ("https://job-boards.greenhouse.io/acme/jobs/123456", "acme", "123456"),
        ("https://boards.greenhouse.io/stripe/jobs/999001", "stripe", "999001"),
        (
            "https://boards.greenhouse.io/embed/job_app?for=acme&token=123456",
            "acme",
            "123456",
        ),
    ],
)
def test_parse_greenhouse_url_formats(url: str, board: str, job_id: str) -> None:
    fetcher = GreenhouseFetcher()
    assert fetcher._parse_greenhouse_url(url) == (board, job_id)


@pytest.mark.parametrize(
    "url",
    [
        "https://job-boards.greenhouse.io/acme",
        "https://job-boards.greenhouse.io/acme/jobs/",
        "https://job-boards.greenhouse.io/acme/jobs/not-a-number",
        "https://boards.greenhouse.io/embed/job_app?token=123",
        "https://example.com/jobs/123",
    ],
)
def test_parse_greenhouse_url_malformed(url: str) -> None:
    fetcher = GreenhouseFetcher()
    with pytest.raises(FetchError):
        fetcher._parse_greenhouse_url(url)


@pytest.mark.asyncio
async def test_greenhouse_fetch_success(greenhouse_payload: dict) -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get.return_value = _mock_response(200, greenhouse_payload)

    fetcher = GreenhouseFetcher(client=client)
    result = await fetcher.fetch(
        "https://job-boards.greenhouse.io/acme/jobs/123456"
    )

    assert result.source == "greenhouse"
    assert result.title == "Software Engineer"
    assert result.company == "Acme"
    assert "Build things." in result.description
    assert "- Python" in result.description
    assert result.raw == greenhouse_payload
    client.get.assert_awaited_once()
    called_url = client.get.await_args.args[0]
    assert called_url.endswith("/boards/acme/jobs/123456")


@pytest.mark.asyncio
async def test_greenhouse_api_failure() -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get.return_value = _mock_response(500, {"error": "boom"})

    fetcher = GreenhouseFetcher(client=client)
    with pytest.raises(FetchError, match="API request failed"):
        await fetcher.fetch("https://job-boards.greenhouse.io/acme/jobs/123456")


@pytest.mark.asyncio
async def test_greenhouse_job_not_found() -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get.return_value = _mock_response(404, {"error": "not found"})

    fetcher = GreenhouseFetcher(client=client)
    with pytest.raises(FetchError, match="not found"):
        await fetcher.fetch("https://job-boards.greenhouse.io/acme/jobs/123456")


@pytest.mark.asyncio
async def test_greenhouse_missing_content() -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get.return_value = _mock_response(200, {"id": 1, "title": "X"})

    fetcher = GreenhouseFetcher(client=client)
    with pytest.raises(FetchError, match="missing job content"):
        await fetcher.fetch("https://job-boards.greenhouse.io/acme/jobs/123456")
