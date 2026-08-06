"""Shared HTTP helpers for ATS board listing sources."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from fetchers.base import DEFAULT_HEADERS, DEFAULT_TIMEOUT
from fetchers.exceptions import FetchError

logger = logging.getLogger(__name__)


async def http_get_json(
    url: str,
    *,
    client: httpx.AsyncClient | None = None,
    params: dict[str, Any] | None = None,
    timeout: httpx.Timeout | None = None,
    delay_ms: int = 0,
) -> Any:
    """GET ``url`` and return parsed JSON (dict or list)."""
    if delay_ms > 0:
        await asyncio.sleep(delay_ms / 1000.0)

    headers = {**DEFAULT_HEADERS, "Accept": "application/json"}
    use_timeout = timeout or DEFAULT_TIMEOUT

    logger.info("Board list request: GET %s", url)
    try:
        if client is not None:
            response = await client.get(url, params=params, headers=headers)
        else:
            async with httpx.AsyncClient(
                timeout=use_timeout,
                follow_redirects=True,
                headers=DEFAULT_HEADERS,
            ) as owned:
                response = await owned.get(url, params=params, headers=headers)
    except httpx.TimeoutException as exc:
        raise FetchError(f"Request timed out: {url}", url=url) from exc
    except httpx.RequestError as exc:
        raise FetchError(f"Request failed: {exc}", url=url) from exc

    if response.status_code == 404:
        raise FetchError("Board not found", url=str(response.url))
    if response.status_code >= 400:
        raise FetchError(
            f"API request failed with status {response.status_code}",
            url=str(response.url),
        )

    try:
        return response.json()
    except ValueError as exc:
        raise FetchError("Unsupported response: expected JSON", url=url) from exc
