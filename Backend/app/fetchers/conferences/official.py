"""Official-page verification: extract facts from HTML, never invent them."""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urljoin

from bs4 import BeautifulSoup
import httpx

from fetchers.conferences.http import RobotsChecker, get_html
from fetchers.utils import html_to_text
from processors.conferences.dates import parse_date_range
from processors.location import classify_conference_location, parse_location_parts

logger = logging.getLogger(__name__)

_LOCATION_LINE_RE = re.compile(
    r"(?:location|venue|where)\s*[:\-]\s*(.+)",
    re.IGNORECASE,
)
_DATE_LINE_RE = re.compile(
    r"(?:dates?|when)\s*[:\-]\s*(.+)",
    re.IGNORECASE,
)


class OfficialPageVerifier:
    """Fetch an official conference page and overlay verified fields."""

    def __init__(
        self,
        *,
        client: httpx.AsyncClient | None = None,
        robots: RobotsChecker | None = None,
        delay_ms: int = 300,
    ) -> None:
        self._client = client
        self._robots = robots if robots is not None else RobotsChecker()
        self._delay_ms = delay_ms

    async def verify(self, url: str) -> dict[str, Any]:
        html = await get_html(
            url,
            client=self._client,
            delay_ms=self._delay_ms,
            robots=self._robots,
        )
        text = html_to_text(html)
        facts = extract_official_facts(text, html=html, page_url=url)
        facts["official_url"] = url
        facts["last_verified_at"] = datetime.now(timezone.utc)
        facts["page_text"] = text
        facts["child_links"] = funding_links(html, url)
        return facts


def extract_official_facts(
    text: str,
    *,
    html: str | None = None,
    page_url: str | None = None,
) -> dict[str, Any]:
    """Pull dates/location only when they appear explicitly in the page."""
    facts: dict[str, Any] = {}
    loc_match = _LOCATION_LINE_RE.search(text)
    if loc_match:
        location = loc_match.group(1).split("\n")[0].strip()
        if location:
            facts["location"] = location[:200]
            city, state, country = parse_location_parts(location)
            facts["city"] = city
            facts["state"] = state
            facts["country"] = country
            facts["location_status"] = classify_conference_location(location)

    date_match = _DATE_LINE_RE.search(text)
    if date_match:
        start, end = parse_date_range(date_match.group(1))
        if start:
            facts["start_date"] = start
            facts["end_date"] = end
    if "start_date" not in facts:
        start, end = parse_date_range(text[:4000])
        if start:
            facts["start_date"] = start
            facts["end_date"] = end
    return facts


_FUNDING_HREF_RE = re.compile(
    r"(financial-assistance|financial_assistance|travel-grant|travel_grant|"
    r"student-travel|scholarship|registration|volunteer|diversity|"
    r"student-support|attend)",
    re.IGNORECASE,
)


def funding_links(html: str, base_url: str, *, limit: int = 6) -> list[str]:
    soup = BeautifulSoup(html, "lxml")
    found: list[str] = []
    seen: set[str] = set()
    for anchor in soup.find_all("a", href=True):
        href = str(anchor.get("href") or "")
        label = " ".join(anchor.stripped_strings)
        if not _FUNDING_HREF_RE.search(href) and not _FUNDING_HREF_RE.search(label):
            continue
        absolute = urljoin(base_url, href)
        if absolute in seen or absolute.startswith("mailto:"):
            continue
        seen.add(absolute)
        found.append(absolute)
        if len(found) >= limit:
            break
    return found
