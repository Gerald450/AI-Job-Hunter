"""Official conference listing and series homepage fetchers."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from fetchers.conferences.http import RobotsChecker, get_html
from fetchers.conferences.official import extract_official_facts
from fetchers.exceptions import FetchError
from fetchers.utils import html_to_text
from sources.conferences.base import ConferenceFetcher
from sources.conferences.html_list import looks_js_shell, parse_heading_list, parse_html_table

logger = logging.getLogger(__name__)


class HtmlListingFetcher(ConferenceFetcher):
    """Fetch a listing URL and parse tables; log if the page looks JS-only."""

    def __init__(
        self,
        *,
        url: str,
        name: str,
        organization: str,
        client: httpx.AsyncClient | None = None,
        robots: RobotsChecker | None = None,
        delay_ms: int = 300,
    ) -> None:
        self.name = name
        self._url = url
        self._organization = organization
        self._client = client
        self._robots = robots if robots is not None else RobotsChecker()
        self._delay_ms = delay_ms
        self.unreliable = False

    async def fetch(self) -> str:
        try:
            html = await get_html(
                self._url,
                client=self._client,
                delay_ms=self._delay_ms,
                robots=self._robots,
            )
        except FetchError as exc:
            logger.warning("%s listing failed: %s", self.name, exc)
            self.unreliable = True
            return ""
        if looks_js_shell(html):
            logger.warning(
                "%s listing looks JavaScript-rendered; treating as unreliable (%s)",
                self.name,
                self._url,
            )
            self.unreliable = True
        return html

    def parse(self, raw: Any) -> list[dict[str, Any]]:
        html = str(raw or "")
        if not html.strip():
            return []
        rows = parse_html_table(
            html,
            source=self.name,
            source_url=self._url,
            organization=self._organization,
        )
        if not rows:
            rows = parse_heading_list(
                html,
                source=self.name,
                source_url=self._url,
                organization=self._organization,
            )
        if not rows:
            logger.info("%s parsed 0 listing rows from %s", self.name, self._url)
        return rows


class SeriesHomepageFetcher(ConferenceFetcher):
    """Single-conference official homepage (NeurIPS, ICML, ...)."""

    def __init__(
        self,
        *,
        url: str,
        name: str,
        organization: str,
        default_name: str,
        client: httpx.AsyncClient | None = None,
        robots: RobotsChecker | None = None,
        delay_ms: int = 300,
    ) -> None:
        self.name = name
        self._url = url
        self._organization = organization
        self._default_name = default_name
        self._client = client
        self._robots = robots if robots is not None else RobotsChecker()
        self._delay_ms = delay_ms

    async def fetch(self) -> str:
        return await get_html(
            self._url,
            client=self._client,
            delay_ms=self._delay_ms,
            robots=self._robots,
        )

    def parse(self, raw: Any) -> list[dict[str, Any]]:
        html = str(raw or "")
        text = html_to_text(html)
        facts = extract_official_facts(text, html=html, page_url=self._url)
        title = _page_title(html) or self._default_name
        row = {
            "name": title,
            "organization": self._organization,
            "official_url": self._url,
            "source": self.name,
            "source_url": self._url,
            "description": text[:2000] or None,
            **facts,
        }
        return [row]


def _page_title(html: str) -> str | None:
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "lxml")
    if soup.title and soup.title.string:
        return " ".join(soup.title.string.split()) or None
    heading = soup.find(["h1"])
    if heading:
        return heading.get_text(" ", strip=True) or None
    return None


class USENIXConferenceFetcher(HtmlListingFetcher):
    def __init__(self, **kwargs: Any) -> None:
        super().__init__(
            url="https://www.usenix.org/conferences",
            name="usenix",
            organization="USENIX",
            **kwargs,
        )


class ACMConferenceFetcher(HtmlListingFetcher):
    def __init__(self, **kwargs: Any) -> None:
        super().__init__(
            url="https://www.acm.org/conferences/conference-events",
            name="acm",
            organization="ACM",
            **kwargs,
        )


class IEEEConferenceFetcher(HtmlListingFetcher):
    def __init__(self, **kwargs: Any) -> None:
        super().__init__(
            url="https://www.ieee.org/conferences/",
            name="ieee",
            organization="IEEE",
            **kwargs,
        )


class ACLConferenceFetcher(HtmlListingFetcher):
    def __init__(self, **kwargs: Any) -> None:
        super().__init__(
            url="https://aclanthology.org/venues/",
            name="acl",
            organization="ACL",
            **kwargs,
        )


class NeurIPSConferenceFetcher(SeriesHomepageFetcher):
    def __init__(self, **kwargs: Any) -> None:
        super().__init__(
            url="https://neurips.cc/",
            name="neurips",
            organization="NeurIPS",
            default_name="NeurIPS",
            **kwargs,
        )


class ICMLConferenceFetcher(SeriesHomepageFetcher):
    def __init__(self, **kwargs: Any) -> None:
        super().__init__(
            url="https://icml.cc/",
            name="icml",
            organization="ICML",
            default_name="ICML",
            **kwargs,
        )


class ICLRConferenceFetcher(SeriesHomepageFetcher):
    def __init__(self, **kwargs: Any) -> None:
        super().__init__(
            url="https://iclr.cc/",
            name="iclr",
            organization="ICLR",
            default_name="ICLR",
            **kwargs,
        )


class AAAIConferenceFetcher(SeriesHomepageFetcher):
    def __init__(self, **kwargs: Any) -> None:
        super().__init__(
            url="https://aaai.org/",
            name="aaai",
            organization="AAAI",
            default_name="AAAI",
            **kwargs,
        )


class CVPRConferenceFetcher(SeriesHomepageFetcher):
    def __init__(self, **kwargs: Any) -> None:
        super().__init__(
            url="https://cvpr.thecvf.com/",
            name="cvpr",
            organization="CVF",
            default_name="CVPR",
            **kwargs,
        )
