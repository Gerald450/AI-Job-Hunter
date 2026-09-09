"""Community markdown discovery: Awesome AI Conferences."""

from __future__ import annotations

import calendar
import re
from typing import Any

import httpx

from fetchers.conferences.http import RobotsChecker, get_html
from sources.conferences.base import ConferenceFetcher

RAW_URL = (
    "https://raw.githubusercontent.com/The-AI-Alliance/community/"
    "main/events/awesome-ai-conferences.md"
)

_YEAR_RE = re.compile(r"^##\s+(20\d{2})\s*$")
_MONTH_RE = re.compile(r"^###\s+([A-Za-z]+)\s*$")
_ITEM_RE = re.compile(
    r"^\*\s+(\S+)\s+\[([^\]]+)\]\(([^)]+)\)(?:\s*[-–—]?\s*(.*))?$",
)

_MONTHS = {name.lower(): i for i, name in enumerate(calendar.month_name) if name}


class AwesomeAIConferenceFetcher(ConferenceFetcher):
    name = "awesome_ai"

    def __init__(
        self,
        *,
        client: httpx.AsyncClient | None = None,
        robots: RobotsChecker | None = None,
        delay_ms: int = 0,
        url: str = RAW_URL,
    ) -> None:
        self._client = client
        self._robots = robots if robots is not None else RobotsChecker()
        self._delay_ms = delay_ms
        self._url = url

    async def fetch(self) -> str:
        return await get_html(
            self._url,
            client=self._client,
            delay_ms=self._delay_ms,
            robots=self._robots,
        )

    def parse(self, raw: Any) -> list[dict[str, Any]]:
        text = str(raw or "")
        year: int | None = None
        month: int | None = None
        rows: list[dict[str, Any]] = []
        for line in text.splitlines():
            year_match = _YEAR_RE.match(line.strip())
            if year_match:
                year = int(year_match.group(1))
                month = None
                continue
            month_match = _MONTH_RE.match(line.strip())
            if month_match:
                month = _MONTHS.get(month_match.group(1).lower())
                continue
            item = _ITEM_RE.match(line.strip())
            if not item or year is None:
                continue
            date_token, name, url, rest = item.groups()
            location = (rest or "").strip() or None
            rows.append(
                {
                    "name": name.strip(),
                    "official_url": url.strip(),
                    "source": self.name,
                    "source_url": self._url,
                    "location": location,
                    "date_text": date_token,
                    "year": year,
                    "month": month,
                }
            )
        return rows
