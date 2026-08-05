"""Generic HTML fallback fetcher (no Playwright)."""

from __future__ import annotations

import logging
import re
from typing import ClassVar

from bs4 import BeautifulSoup

from fetchers.base import BaseFetcher, JobDescription
from fetchers.exceptions import FetchError
from fetchers.utils import html_to_text, parse_url

logger = logging.getLogger(__name__)

_TITLE_RE = re.compile(r"\s+")


class GenericFetcher(BaseFetcher):
    """Download page HTML with httpx and convert the main content to plain text."""

    SOURCE: ClassVar[str] = "generic"

    async def fetch(self, url: str) -> JobDescription:
        logger.info("Fetch started: source=%s url=%s", self.SOURCE, url)
        parse_url(url)  # validate early
        logger.info("ATS detected: generic (fallback)")
        logger.info("API endpoint used: %s", url)

        response = await self._get(url, accept_json=False)
        self._ensure_ok(response, not_found_message="Page not found")

        content_type = response.headers.get("content-type", "")
        if "html" not in content_type.lower() and not response.text.lstrip().startswith(
            ("<", "<!")
        ):
            raise FetchError(
                f"Unsupported response: expected HTML, got '{content_type}'",
                url=url,
            )

        html = response.text
        if not html.strip():
            raise FetchError("Page content was empty", url=url)

        description = self._extract_main_text(html)
        if not description:
            raise FetchError("Could not extract text from page", url=url)

        title = self._extract_title(html)

        logger.info("Fetch success: source=%s", self.SOURCE)
        return JobDescription(
            description=description,
            source=self.SOURCE,
            title=title,
            company=None,
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
            or soup.find(attrs={"role": "main"})
            or soup.body
            or soup
        )
        return html_to_text(str(main))

    def _extract_title(self, html: str) -> str | None:
        soup = BeautifulSoup(html, "lxml")
        if soup.title and soup.title.string:
            return _TITLE_RE.sub(" ", soup.title.string).strip() or None
        og = soup.find("meta", property="og:title")
        if og and og.get("content"):
            return str(og["content"]).strip() or None
        return None
