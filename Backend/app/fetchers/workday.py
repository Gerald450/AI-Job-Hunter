"""Workday careers-site job-description fetcher."""

from __future__ import annotations

import logging
from typing import ClassVar

import httpx
from bs4 import BeautifulSoup

from fetchers.base import BaseFetcher, JobDescription
from fetchers.exceptions import FetchError
from fetchers.utils import html_to_text
from fetchers.workday_client import TenantPatternCache, WorkdayClient
from fetchers.workday_parser import normalize_workday_payload, parse_workday_url

logger = logging.getLogger(__name__)


class WorkdayFetcher(BaseFetcher):
    """Fetch job descriptions from Workday CXS JSON endpoints (no Playwright).

    Orchestrates URL parsing, multi-pattern API discovery, response
    normalization, and a last-resort HTML fallback only when every API
    attempt fails.
    """

    SOURCE: ClassVar[str] = "workday"

    def __init__(
        self,
        client: httpx.AsyncClient | None = None,
        *,
        workday_client: WorkdayClient | None = None,
        pattern_cache: TenantPatternCache | None = None,
        allow_html_fallback: bool = True,
    ) -> None:
        super().__init__(client=client)
        self._workday_client = workday_client or WorkdayClient(
            client=client,
            pattern_cache=pattern_cache,
        )
        self._allow_html_fallback = allow_html_fallback

    @property
    def pattern_cache(self) -> TenantPatternCache:
        """Expose the tenant → pattern cache for inspection or persistence."""
        return self._workday_client.pattern_cache

    async def fetch(self, url: str) -> JobDescription:
        logger.info("Fetch started: source=%s url=%s", self.SOURCE, url)
        parsed = parse_workday_url(url)
        logger.info(
            "ATS detected: workday tenant=%s site=%s locale=%s job_id=%s",
            parsed.tenant,
            parsed.site,
            parsed.locale,
            parsed.job_id,
        )

        try:
            api_result = await self._workday_client.fetch_job(parsed)
        except FetchError as api_error:
            if not self._allow_html_fallback:
                raise
            logger.warning(
                "Workday CXS API exhausted for tenant=%s; trying HTML fallback (%s)",
                parsed.tenant,
                api_error,
            )
            return await self._fetch_html_fallback(url, company=parsed.tenant)

        try:
            normalized = normalize_workday_payload(
                api_result.payload,
                fallback_company=parsed.tenant,
            )
        except FetchError:
            logger.error(
                "Workday parsing failure for endpoint=%s",
                api_result.endpoint,
            )
            if self._allow_html_fallback:
                logger.warning(
                    "Workday JSON unusable; trying HTML fallback for url=%s",
                    url,
                )
                return await self._fetch_html_fallback(url, company=parsed.tenant)
            raise

        logger.info(
            "Fetch success: source=%s tenant=%s pattern=%s",
            self.SOURCE,
            parsed.tenant,
            api_result.pattern_name,
        )
        return JobDescription(
            description=normalized.description,
            source=self.SOURCE,
            title=normalized.title,
            company=normalized.company,
            raw=normalized.raw,
            url=url,
        )

    async def _fetch_html_fallback(
        self,
        url: str,
        *,
        company: str | None,
    ) -> JobDescription:
        """Last resort: download the public job page HTML and extract text."""
        logger.info("Workday HTML fallback: GET %s", url)
        response = await self._get(url, accept_json=False)

        if response.status_code == 404:
            raise FetchError("Workday job not found", url=url)
        if response.status_code == 403:
            raise FetchError("Workday page forbidden (403)", url=url)
        self._ensure_ok(response, not_found_message="Workday job not found")

        html = response.text
        if not html.strip():
            raise FetchError("Workday page content was empty", url=url)

        description = self._extract_main_text(html)
        if not description:
            raise FetchError("Could not extract Workday job text from HTML", url=url)

        title = self._extract_title(html)
        logger.info("Fetch success: source=%s via=html_fallback", self.SOURCE)
        return JobDescription(
            description=description,
            source=self.SOURCE,
            title=title,
            company=company,
            raw=None,
            url=url,
        )

    def _extract_main_text(self, html: str) -> str:
        soup = BeautifulSoup(html, "lxml")
        for tag in soup(["script", "style", "noscript", "svg", "iframe"]):
            tag.decompose()

        main = (
            soup.find("main")
            or soup.find("article")
            or soup.find(attrs={"data-automation-id": "jobPostingDescription"})
            or soup.find(attrs={"role": "main"})
            or soup.body
            or soup
        )
        return html_to_text(str(main))

    def _extract_title(self, html: str) -> str | None:
        soup = BeautifulSoup(html, "lxml")
        heading = soup.find(attrs={"data-automation-id": "jobPostingHeader"})
        if heading and heading.get_text(strip=True):
            return heading.get_text(strip=True)
        if soup.title and soup.title.string:
            return " ".join(soup.title.string.split()).strip() or None
        return None
