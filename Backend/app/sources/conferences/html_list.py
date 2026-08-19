"""Shared HTML listing helpers for official conference pages."""

from __future__ import annotations

import logging
import re
from typing import Any
from urllib.parse import urljoin

from bs4 import BeautifulSoup, Tag

from fetchers.utils import html_to_text

logger = logging.getLogger(__name__)


def parse_html_table(
    html: str,
    *,
    source: str,
    source_url: str,
    organization: str | None = None,
) -> list[dict[str, Any]]:
    """Parse first useful HTML table with title/date/location-ish headers."""
    soup = BeautifulSoup(html, "lxml")
    rows: list[dict[str, Any]] = []
    for table in soup.find_all("table"):
        if not isinstance(table, Tag):
            continue
        headers = [_cell_text(cell).lower() for cell in table.find_all("th")]
        if not headers:
            first = table.find("tr")
            if first:
                headers = [_cell_text(cell).lower() for cell in first.find_all(["td", "th"])]
        mapped = _map_headers(headers)
        if "name" not in mapped:
            continue
        body_rows = table.find_all("tr")
        start_index = 1 if headers else 0
        for tr in body_rows[start_index:]:
            cells = tr.find_all(["td", "th"])
            if len(cells) < 2:
                continue
            values = [_cell_text(cell) for cell in cells]
            name = _get(values, mapped.get("name"))
            if not name:
                continue
            link = _first_link(tr, source_url)
            rows.append(
                {
                    "name": name,
                    "organization": organization,
                    "official_url": link,
                    "source": source,
                    "source_url": source_url,
                    "date_text": _get(values, mapped.get("date")),
                    "location": _get(values, mapped.get("location")),
                }
            )
        if rows:
            break
    return rows


def parse_heading_list(
    html: str,
    *,
    source: str,
    source_url: str,
    organization: str | None = None,
) -> list[dict[str, Any]]:
    """Fallback: collect heading + nearby text when the listing is not a table."""
    soup = BeautifulSoup(html, "lxml")
    rows: list[dict[str, Any]] = []
    for heading in soup.find_all(["h2", "h3", "h4"]):
        name = heading.get_text(" ", strip=True)
        if not name or len(name) < 4:
            continue
        if re.search(r"upcoming|past|conference", name, re.IGNORECASE) and len(name) < 24:
            continue
        link_tag = heading.find("a", href=True)
        link = urljoin(source_url, str(link_tag["href"])) if link_tag else source_url
        sibling_text = ""
        nxt = heading.find_next_sibling()
        if nxt:
            sibling_text = nxt.get_text(" ", strip=True)[:300]
        rows.append(
            {
                "name": name,
                "organization": organization,
                "official_url": link,
                "source": source,
                "source_url": source_url,
                "date_text": sibling_text,
                "location": sibling_text,
            }
        )
    return rows[:80]


def looks_js_shell(html: str) -> bool:
    """Heuristic: almost no text in the document body."""
    text = html_to_text(html)
    return len(text) < 400


def _map_headers(headers: list[str]) -> dict[str, int]:
    mapping: dict[str, int] = {}
    for index, header in enumerate(headers):
        if any(k in header for k in ("title", "conference", "event", "name")):
            mapping.setdefault("name", index)
        elif any(k in header for k in ("date", "when")):
            mapping.setdefault("date", index)
        elif any(k in header for k in ("location", "venue", "where", "city")):
            mapping.setdefault("location", index)
    return mapping


def _get(values: list[str], index: int | None) -> str | None:
    if index is None or index >= len(values):
        return None
    text = values[index].strip()
    return text or None


def _cell_text(cell: Tag) -> str:
    return " ".join(cell.stripped_strings)


def _first_link(row: Tag, base: str) -> str | None:
    anchor = row.find("a", href=True)
    if not anchor:
        return None
    href = str(anchor.get("href") or "")
    if href.startswith("#"):
        return None
    return urljoin(base, href)
