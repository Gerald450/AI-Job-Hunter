"""Route job URLs to the appropriate ATS fetcher (Strategy Pattern)."""

from __future__ import annotations

import logging
from urllib.parse import urlparse

import httpx

from fetchers.ashby import AshbyFetcher
from fetchers.base import BaseFetcher, JobDescription
from fetchers.exceptions import FetchError
from fetchers.generic import GenericFetcher
from fetchers.greenhouse import GreenhouseFetcher
from fetchers.lever import LeverFetcher
from fetchers.smartrecruiters import SmartRecruitersFetcher

logger = logging.getLogger(__name__)


class FetcherRouter:
    """Select a ``BaseFetcher`` implementation based on the job URL host."""

    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        """Optionally share one ``httpx.AsyncClient`` across all fetchers."""
        self._client = client
        self._registry: dict[str, BaseFetcher] = {
            "greenhouse": GreenhouseFetcher(client=client),
            "lever": LeverFetcher(client=client),
            "ashby": AshbyFetcher(client=client),
            "smartrecruiters": SmartRecruitersFetcher(client=client),
            "generic": GenericFetcher(client=client),
        }

    def detect_source(self, url: str) -> str:
        """Return the ATS source key for ``url`` (never raises for unknown hosts)."""
        if not url or not isinstance(url, str) or not url.strip():
            raise FetchError("Invalid URL: empty or missing", url=url)

        try:
            host = (urlparse(url.strip()).netloc or "").lower()
        except Exception as exc:  # noqa: BLE001
            raise FetchError(f"Invalid URL: {exc}", url=url) from exc

        if not host:
            raise FetchError("Invalid URL: missing host", url=url)

        if "greenhouse.io" in host:
            return "greenhouse"
        if "lever.co" in host:
            return "lever"
        if "ashbyhq.com" in host or host.endswith("ashby.com"):
            return "ashby"
        if "smartrecruiters.com" in host:
            return "smartrecruiters"
        return "generic"

    def get_fetcher(self, url: str) -> BaseFetcher:
        """Return the fetcher strategy for ``url``.

        Examples:
            greenhouse.io → GreenhouseFetcher
            lever.co → LeverFetcher
            ashbyhq.com → AshbyFetcher
            smartrecruiters.com → SmartRecruitersFetcher
            everything else → GenericFetcher
        """
        source = self.detect_source(url)
        logger.info("ATS detected: %s for url=%s", source, url)
        return self._registry[source]

    async def fetch(self, url: str) -> JobDescription:
        """Convenience: resolve the fetcher and retrieve the description."""
        fetcher = self.get_fetcher(url)
        try:
            return await fetcher.fetch(url)
        except FetchError:
            logger.error("Fetch failure: source=%s url=%s", fetcher.SOURCE, url)
            raise
