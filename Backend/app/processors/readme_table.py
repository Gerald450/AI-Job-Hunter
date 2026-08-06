"""Shared HTML-table parsing for GitHub job-list READMEs (PittCSC, SimplifyJobs)."""

from __future__ import annotations

import logging
import re
from typing import Any

from bs4 import BeautifulSoup, Tag

logger = logging.getLogger(__name__)

_CONTINUATION = "↳"

# Header aliases → canonical field names.
_HEADER_MAP: dict[str, str] = {
    "company": "company",
    "role": "role",
    "position": "role",
    "title": "role",
    "location": "location",
    "locations": "location",
    "application": "application",
    "apply": "application",
    "link": "application",
    "age": "age",
    "date": "age",
    "posted": "age",
    "notes": "notes",
    "note": "notes",
    "extra": "notes",
    "sponsorship": "notes",
}


def parse_readme_tables(
    html: str,
    *,
    source: str,
    allowed_section_keywords: tuple[str, ...] | None = None,
    skip_inactive: bool = True,
) -> list[dict[str, Any]]:
    """Parse job rows from HTML tables embedded in a GitHub README.

    Args:
        html: Raw README content (markdown with HTML tables).
        source: Value written to each job's ``source`` field.
        allowed_section_keywords: If set, only tables under ``##`` headings whose
            text matches one of these keywords (case-insensitive) are parsed.
            When ``None``, every non-inactive table is parsed.
        skip_inactive: Skip tables nested under ``<details>`` / "Inactive roles".

    Returns:
        List of raw job dicts (not yet normalized to ``Job``).
    """
    if not html or not html.strip():
        logger.warning("Empty README content for source=%s", source)
        return []

    sections = _split_sections(html)
    jobs: list[dict[str, Any]] = []
    total_rows = 0
    skipped = 0

    for heading, body in sections:
        if allowed_section_keywords and not _section_allowed(
            heading, allowed_section_keywords
        ):
            logger.info(
                "Skipping section for source=%s: %s",
                source,
                heading[:80] or "(preamble)",
            )
            continue

        soup = BeautifulSoup(body, "lxml")
        if skip_inactive:
            for details in soup.find_all("details"):
                details.decompose()

        for table in soup.find_all("table"):
            if not isinstance(table, Tag):
                continue
            column_map = _column_map_from_table(table)
            if "company" not in column_map or "role" not in column_map:
                logger.warning(
                    "Skipping table without company/role headers (source=%s)",
                    source,
                )
                continue

            last_company: str | None = None
            rows = table.find_all("tr")
            for row in rows:
                if not isinstance(row, Tag):
                    continue
                if row.find("th"):
                    continue  # header row

                total_rows += 1
                try:
                    parsed = _parse_row(row, column_map, source=source)
                except Exception:  # noqa: BLE001 - resilient: never crash the batch
                    skipped += 1
                    logger.exception("Parsing error in source=%s row; skipping", source)
                    continue

                if parsed is None:
                    skipped += 1
                    continue

                company = parsed["company"]
                if company == _CONTINUATION or company.strip() == _CONTINUATION:
                    if last_company:
                        parsed["company"] = last_company
                    else:
                        skipped += 1
                        logger.info(
                            "Skipped continuation row with no prior company (source=%s)",
                            source,
                        )
                        continue
                elif company:
                    last_company = company

                jobs.append(parsed)

    logger.info(
        "README table parse complete: source=%s total_rows=%s parsed=%s skipped=%s",
        source,
        total_rows,
        len(jobs),
        skipped,
    )
    return jobs


def _split_sections(html: str) -> list[tuple[str, str]]:
    """Split README into ``(heading, body)`` pairs on markdown ``##`` headings."""
    parts = re.split(r"(?=^## )", html, flags=re.MULTILINE)
    sections: list[tuple[str, str]] = []
    for part in parts:
        if not part.strip():
            continue
        lines = part.split("\n", 1)
        heading = lines[0].strip()
        body = lines[1] if len(lines) > 1 else ""
        if heading.startswith("## "):
            sections.append((heading[3:].strip(), body))
        else:
            sections.append(("", part))
    return sections


def _section_allowed(heading: str, keywords: tuple[str, ...]) -> bool:
    if not heading:
        return False
    lower = heading.lower()
    return any(keyword.lower() in lower for keyword in keywords)


def _column_map_from_table(table: Tag) -> dict[str, int]:
    """Map canonical field name → column index from the header row."""
    header_row = table.find("tr")
    if not isinstance(header_row, Tag):
        return {}

    headers = header_row.find_all(["th", "td"])
    mapping: dict[str, int] = {}
    for index, cell in enumerate(headers):
        label = re.sub(r"\s+", " ", cell.get_text(" ", strip=True)).strip().lower()
        # Strip emoji / punctuation noise from header labels.
        label = re.sub(r"[^a-z0-9\s]", "", label).strip()
        field = _HEADER_MAP.get(label)
        if field and field not in mapping:
            mapping[field] = index
    return mapping


def _parse_row(
    row: Tag,
    column_map: dict[str, int],
    *,
    source: str,
) -> dict[str, Any] | None:
    cells = row.find_all("td")
    if not cells:
        return None

    def cell_at(field: str) -> Tag | None:
        index = column_map.get(field)
        if index is None or index >= len(cells):
            return None
        cell = cells[index]
        return cell if isinstance(cell, Tag) else None

    company_cell = cell_at("company")
    role_cell = cell_at("role")
    if company_cell is None or role_cell is None:
        return None

    company = company_cell.get_text(" ", strip=True)
    role = role_cell.get_text(" ", strip=True)
    if not company and not role:
        return None
    if not role:
        return None

    location_cell = cell_at("location")
    location = (
        location_cell.get_text(" ", strip=True) if location_cell is not None else ""
    )

    application_cell = cell_at("application")
    apply_url = (
        _extract_apply_url(application_cell) if application_cell is not None else None
    )
    if not apply_url:
        return None

    age_cell = cell_at("age")
    age = age_cell.get_text(" ", strip=True) if age_cell is not None else ""

    notes_cell = cell_at("notes")
    notes = notes_cell.get_text(" ", strip=True) if notes_cell is not None else ""

    return {
        "company": company,
        "role": role,
        "location": location,
        "apply_url": apply_url,
        "age": age or "unknown",
        "notes": notes,
        "source": source,
    }


def _extract_apply_url(application_cell: Tag) -> str | None:
    """Prefer the real ATS apply link over the Simplify tracking badge."""
    anchors = application_cell.find_all("a", href=True)
    if not anchors:
        return None

    preferred: list[str] = []
    fallback: list[str] = []
    for anchor in anchors:
        href = str(anchor.get("href", "")).strip()
        if not href or href.startswith("#"):
            continue
        img = anchor.find("img")
        alt = ""
        if img is not None:
            alt = str(img.get("alt", "")).lower()
        if "simplify.jobs" in href.lower() and "apply" not in alt:
            fallback.append(href)
            continue
        if alt == "apply" or "simplify.jobs" not in href.lower():
            preferred.append(href)
        else:
            fallback.append(href)

    if preferred:
        return preferred[0]
    if fallback:
        return fallback[0]
    return None
