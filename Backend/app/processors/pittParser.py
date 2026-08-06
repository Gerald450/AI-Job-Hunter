"""PittCSC Summer Internships README parser."""

from __future__ import annotations

from typing import Any

from processors.readme_table import parse_readme_tables


def parse_jobs(html: str, *, source: str = "pittcsc") -> list[dict[str, Any]]:
    """Parse PittCSC-style HTML job tables into raw job dicts."""
    return parse_readme_tables(html, source=source, skip_inactive=True)
