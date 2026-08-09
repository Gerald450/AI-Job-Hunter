"""Tests for AshbyFetcher."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from fetchers.ashby import AshbyFetcher
from fetchers.exceptions import FetchError

JOB_ID = "11111111-2222-3333-4444-555555555555"
JOB_URL = f"https://jobs.ashbyhq.com/acme/{JOB_ID}"


def _mock_response(
    status_code: int,
    payload: dict | list | None = None,
    *,
    url: str = "https://api.ashbyhq.com/posting-api/job-board/acme",
) -> MagicMock:
    response = MagicMock(spec=httpx.Response)
    response.status_code = status_code
    response.url = url
    response.json.return_value = payload
    return response


@pytest.mark.parametrize(
    ("url", "board", "job_id"),
    [
        (JOB_URL, "acme", JOB_ID),
        (f"{JOB_URL}/application", "acme", JOB_ID),
        (
            "https://jobs.ashbyhq.com/Notion/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
            "Notion",
            "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        ),
    ],
)
def test_parse_ashby_url_formats(url: str, board: str, job_id: str) -> None:
    fetcher = AshbyFetcher()
    assert fetcher._parse_ashby_url(url) == (board, job_id)


@pytest.mark.parametrize(
    "url",
    [
        "https://jobs.ashbyhq.com/acme",
        "https://jobs.ashbyhq.com/",
        "https://example.com/acme/abc",
    ],
)
def test_parse_ashby_url_malformed(url: str) -> None:
    fetcher = AshbyFetcher()
    with pytest.raises(FetchError):
        fetcher._parse_ashby_url(url)


@pytest.mark.parametrize("single_status", [401, 403, 404])
@pytest.mark.asyncio
async def test_ashby_fetch_via_board_list(
    ashby_board_payload: dict, single_status: int
) -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    # Single-job endpoint miss/auth → fall back to board list.
    client.get.side_effect = [
        _mock_response(single_status, {"error": "missing"}),
        _mock_response(200, ashby_board_payload),
    ]

    fetcher = AshbyFetcher(client=client)
    result = await fetcher.fetch(JOB_URL)

    assert result.source == "ashby"
    assert result.title == "Platform Engineer"
    assert result.company == "acme"
    assert "Own the platform." in result.description
    assert client.get.await_count == 2


@pytest.mark.asyncio
async def test_ashby_fetch_via_single_job_endpoint() -> None:
    single_job = {
        "id": JOB_ID,
        "title": "Platform Engineer",
        "descriptionPlain": "Own the platform.",
        "jobUrl": JOB_URL,
    }
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get.return_value = _mock_response(
        200,
        single_job,
        url=f"https://api.ashbyhq.com/posting-api/job-board/acme/job/{JOB_ID}",
    )

    fetcher = AshbyFetcher(client=client)
    result = await fetcher.fetch(JOB_URL)

    assert result.source == "ashby"
    assert "Own the platform." in result.description
    client.get.assert_awaited_once()


@pytest.mark.asyncio
async def test_ashby_job_not_on_board(ashby_board_payload: dict) -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get.side_effect = [
        _mock_response(404),
        _mock_response(200, ashby_board_payload),
    ]

    fetcher = AshbyFetcher(client=client)
    with pytest.raises(FetchError, match="not found"):
        await fetcher.fetch(
            "https://jobs.ashbyhq.com/acme/00000000-0000-0000-0000-000000000000"
        )


@pytest.mark.asyncio
async def test_ashby_api_failure() -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get.return_value = _mock_response(500, {"error": "boom"})

    fetcher = AshbyFetcher(client=client)
    with pytest.raises(FetchError, match="API request failed"):
        await fetcher.fetch(JOB_URL)
