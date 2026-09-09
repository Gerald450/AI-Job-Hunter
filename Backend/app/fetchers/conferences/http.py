"""HTTP helpers for conference fetchers: robots.txt, delays, HTML/JSON GET."""

from __future__ import annotations

import asyncio
import logging
from typing import Any
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import httpx

from fetchers.base import DEFAULT_HEADERS, DEFAULT_TIMEOUT
from fetchers.exceptions import FetchError

logger = logging.getLogger(__name__)

USER_AGENT = DEFAULT_HEADERS["User-Agent"]


class RobotsChecker:
    """Cache robots.txt per origin. Fail-open if robots.txt cannot be fetched."""

    def __init__(self) -> None:
        self._parsers: dict[str, RobotFileParser | None] = {}

    async def allowed(self, url: str, client: httpx.AsyncClient | None = None) -> bool:
        parsed = urlparse(url)
        origin = f"{parsed.scheme or 'https'}://{parsed.netloc.lower()}"
        if origin not in self._parsers:
            self._parsers[origin] = await self._load(origin, client)
        parser = self._parsers[origin]
        if parser is None:
            return True
        return parser.can_fetch(USER_AGENT, url)

    async def _load(
        self, origin: str, client: httpx.AsyncClient | None
    ) -> RobotFileParser | None:
        robots_url = urljoin(origin + "/", "robots.txt")
        try:
            response = await _get(
                robots_url, client=client, accept_json=False, delay_ms=0
            )
        except FetchError:
            logger.warning("robots.txt unavailable for %s; continuing", origin)
            return None
        if response.status_code == 404:
            return None
        if response.status_code >= 400:
            logger.warning(
                "robots.txt status %s for %s; continuing",
                response.status_code,
                origin,
            )
            return None
        parser = RobotFileParser()
        parser.set_url(robots_url)
        try:
            parser.parse(response.text.splitlines())
        except Exception:  # noqa: BLE001
            logger.warning("Failed to parse robots.txt at %s", robots_url)
            return None
        return parser


async def _get(
    url: str,
    *,
    client: httpx.AsyncClient | None = None,
    accept_json: bool = False,
    delay_ms: int = 0,
    timeout: httpx.Timeout | None = None,
) -> httpx.Response:
    if delay_ms > 0:
        await asyncio.sleep(delay_ms / 1000.0)
    headers = dict(DEFAULT_HEADERS)
    if accept_json:
        headers["Accept"] = "application/json"
    use_timeout = timeout or DEFAULT_TIMEOUT
    logger.info("Conference request: GET %s", url)
    try:
        if client is not None:
            return await client.get(url, headers=headers, timeout=use_timeout)
        async with httpx.AsyncClient(
            timeout=use_timeout,
            follow_redirects=True,
            headers=DEFAULT_HEADERS,
        ) as owned:
            return await owned.get(url, headers=headers)
    except httpx.TimeoutException as exc:
        raise FetchError(f"Request timed out: {url}", url=url) from exc
    except httpx.RequestError as exc:
        raise FetchError(f"Request failed: {exc}", url=url) from exc


async def get_json(
    url: str,
    *,
    client: httpx.AsyncClient | None = None,
    delay_ms: int = 0,
    robots: RobotsChecker | None = None,
) -> Any:
    if robots is not None and not await robots.allowed(url, client):
        raise FetchError(f"Disallowed by robots.txt: {url}", url=url)
    response = await _get(url, client=client, accept_json=True, delay_ms=delay_ms)
    if response.status_code >= 400:
        raise FetchError(
            f"API request failed with status {response.status_code}",
            url=url,
        )
    try:
        return response.json()
    except ValueError as exc:
        raise FetchError("Unsupported response: expected JSON", url=url) from exc


async def get_html(
    url: str,
    *,
    client: httpx.AsyncClient | None = None,
    delay_ms: int = 300,
    robots: RobotsChecker | None = None,
) -> str:
    if robots is not None and not await robots.allowed(url, client):
        raise FetchError(f"Disallowed by robots.txt: {url}", url=url)
    response = await _get(url, client=client, accept_json=False, delay_ms=delay_ms)
    if response.status_code == 404:
        raise FetchError("Page not found", url=url)
    if response.status_code >= 400:
        raise FetchError(
            f"API request failed with status {response.status_code}",
            url=url,
        )
    return response.text
