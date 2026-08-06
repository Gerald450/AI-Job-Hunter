"""Tests for GenericFetcher."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from fetchers.exceptions import FetchError
from fetchers.generic import GenericFetcher


def _mock_response(
    status_code: int,
    text: str = "",
    *,
    content_type: str = "text/html",
    url: str = "https://careers.example.com/jobs/1",
) -> MagicMock:
    response = MagicMock(spec=httpx.Response)
    response.status_code = status_code
    response.url = url
    response.text = text
    response.headers = {"content-type": content_type}
    return response


@pytest.mark.asyncio
async def test_generic_fetch_success() -> None:
    html = """
    <html>
      <head><title>Example Role</title></head>
      <body>
        <main>
          <p>We are hiring engineers.</p>
          <ul><li>Remote</li><li>Full-time</li></ul>
        </main>
      </body>
    </html>
    """
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get.return_value = _mock_response(200, html)

    fetcher = GenericFetcher(client=client)
    result = await fetcher.fetch("https://careers.example.com/jobs/1")

    assert result.source == "generic"
    assert result.title == "Example Role"
    assert "We are hiring engineers." in result.description
    assert "- Remote" in result.description
    assert result.raw is None


@pytest.mark.asyncio
async def test_generic_api_failure() -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get.return_value = _mock_response(500, "error")

    fetcher = GenericFetcher(client=client)
    with pytest.raises(FetchError, match="API request failed"):
        await fetcher.fetch("https://careers.example.com/jobs/1")


@pytest.mark.asyncio
async def test_generic_rejects_non_html() -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get.return_value = _mock_response(
        200,
        '{"ok": true}',
        content_type="application/json",
    )

    fetcher = GenericFetcher(client=client)
    with pytest.raises(FetchError, match="expected HTML"):
        await fetcher.fetch("https://careers.example.com/jobs/1")


@pytest.mark.asyncio
async def test_generic_malformed_url() -> None:
    fetcher = GenericFetcher()
    with pytest.raises(FetchError):
        await fetcher.fetch("not-a-url")
