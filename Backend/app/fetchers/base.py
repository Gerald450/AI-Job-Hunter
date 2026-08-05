"""Shared types and abstract base for ATS job-description fetchers."""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, ClassVar

import httpx

from fetchers.exceptions import FetchError

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT = httpx.Timeout(30.0, connect=10.0)
DEFAULT_HEADERS = {
    "User-Agent": "AI-Job-Hunter/0.1 (+https://github.com/geraldshimo/AI-Job-Hunter)",
    "Accept": "application/json, text/html;q=0.9, */*;q=0.8",
}


@dataclass(frozen=True)
class JobDescription:
    """Structured result of a successful job-description fetch.

    Returning metadata alongside the plain-text description avoids a second
    round-trip when later pipeline stages (parsers, scorers, debugging) need
    title/company/source context.
    """

    description: str
    source: str
    title: str | None = None
    company: str | None = None
    raw: dict[str, Any] | None = None
    url: str | None = None


class BaseFetcher(ABC):
    """Strategy interface for retrieving a raw job description from an ATS."""

    SOURCE: ClassVar[str] = "unknown"

    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        """Optionally inject a shared ``httpx.AsyncClient`` for connection reuse."""
        self._client = client

    @abstractmethod
    async def fetch(self, url: str) -> JobDescription:
        """Fetch and return the plain-text job description for ``url``.

        Raises:
            FetchError: On invalid URLs, HTTP failures, unsupported responses,
                or when the job cannot be found.
        """

    async def _get(
        self,
        endpoint: str,
        *,
        params: dict[str, Any] | None = None,
        accept_json: bool = True,
    ) -> httpx.Response:
        """Perform a GET with shared timeout/headers and status checking."""
        headers = dict(DEFAULT_HEADERS)
        if accept_json:
            headers["Accept"] = "application/json"

        logger.info("API request: GET %s", endpoint)

        try:
            if self._client is not None:
                response = await self._client.get(
                    endpoint, params=params, headers=headers
                )
            else:
                async with httpx.AsyncClient(
                    timeout=DEFAULT_TIMEOUT,
                    follow_redirects=True,
                    headers=DEFAULT_HEADERS,
                ) as client:
                    response = await client.get(
                        endpoint, params=params, headers=headers
                    )
        except httpx.TimeoutException as exc:
            logger.error("Request timed out: %s", endpoint)
            raise FetchError(f"Request timed out: {endpoint}", url=endpoint) from exc
        except httpx.RequestError as exc:
            logger.error("Request failed: %s (%s)", endpoint, exc)
            raise FetchError(f"Request failed: {exc}", url=endpoint) from exc

        return response

    def _ensure_ok(
        self,
        response: httpx.Response,
        *,
        not_found_message: str = "Job not found",
    ) -> None:
        """Raise ``FetchError`` for non-success HTTP statuses."""
        if response.status_code == 404:
            logger.error("Job not found: %s", response.url)
            raise FetchError(not_found_message, url=str(response.url))
        if response.status_code >= 400:
            logger.error(
                "API request failed (%s): %s",
                response.status_code,
                response.url,
            )
            raise FetchError(
                f"API request failed with status {response.status_code}",
                url=str(response.url),
            )

    def _parse_json(self, response: httpx.Response) -> dict[str, Any] | list[Any]:
        """Parse a JSON response body or raise ``FetchError``."""
        try:
            return response.json()
        except ValueError as exc:
            logger.error("Unsupported response (invalid JSON): %s", response.url)
            raise FetchError(
                "Unsupported response: expected JSON",
                url=str(response.url),
            ) from exc
