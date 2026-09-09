"""Student-funding extraction from official conference pages."""

from __future__ import annotations

import logging
from typing import Optional

import httpx

from fetchers.conferences.http import RobotsChecker, get_html
from fetchers.conferences.official import OfficialPageVerifier, funding_links
from fetchers.exceptions import FetchError
from fetchers.utils import html_to_text
from model.conference import ConferenceFunding, FundingStatus
from processors.conferences.funding import extract_funding, summarize_funding

logger = logging.getLogger(__name__)


class ConferenceFundingFetcher:
    """Inspect an official conference page (and a few child links) for grants."""

    def __init__(
        self,
        *,
        client: httpx.AsyncClient | None = None,
        robots: RobotsChecker | None = None,
        delay_ms: int = 300,
        max_child_pages: int = 3,
    ) -> None:
        self._client = client
        self._robots = robots if robots is not None else RobotsChecker()
        self._delay_ms = delay_ms
        self._max_child_pages = max_child_pages
        self._verifier = OfficialPageVerifier(
            client=client, robots=self._robots, delay_ms=delay_ms
        )

    async def fetch(
        self,
        url: str,
        *,
        conference_name: str,
        page_html: Optional[str] = None,
        child_links: Optional[list[str]] = None,
    ) -> tuple[list[ConferenceFunding], FundingStatus, dict]:
        texts: list[str] = []
        html = page_html
        links = list(child_links or [])
        if html is None:
            try:
                html = await get_html(
                    url,
                    client=self._client,
                    delay_ms=self._delay_ms,
                    robots=self._robots,
                )
            except FetchError as exc:
                logger.info("Funding fetch skipped url=%s error=%s", url, exc)
                return [], FundingStatus.FUNDING_UNKNOWN, {}
        texts.append(html_to_text(html))
        if not links:
            links = funding_links(html, url)
        for child in links[: self._max_child_pages]:
            try:
                child_html = await get_html(
                    child,
                    client=self._client,
                    delay_ms=self._delay_ms,
                    robots=self._robots,
                )
            except FetchError:
                logger.info("Funding child page skipped url=%s", child)
                continue
            texts.append(html_to_text(child_html))

        blob = "\n\n".join(texts)
        grants = extract_funding(blob, conference_name=conference_name, source_url=url)
        if grants:
            status = FundingStatus.FUNDING_AVAILABLE
        else:
            status = FundingStatus.NO_FUNDING_FOUND
        summary = summarize_funding(grants) if grants else {
            "funding_available": False,
            "travel_grant_available": False,
            "registration_waiver_available": False,
            "scholarship_available": False,
            "funding_amount": None,
            "funding_deadline": None,
            "funding_requirements": None,
        }
        return grants, status, summary
