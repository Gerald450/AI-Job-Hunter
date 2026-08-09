"""Detect minimum years-of-experience requirements from job text."""

from __future__ import annotations

import re
from typing import Optional

from config import load_filters

# Prefer phrases that clearly state a tenure requirement.
_YEAR_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(p)
    for p in (
        # 3-5 years of experience (minimum = first number) — check before singles
        r"(\d+)\s*[-–—]\s*\d+\s*years?(?:\s+of)?(?:\s+(?:professional|relevant|hands-?on|prior))?\s+experience",
        # 5+ years of (professional/relevant) experience
        r"(\d+)\s*\+\s*years?(?:\s+of)?(?:\s+(?:professional|relevant|hands-?on|prior))?\s+experience",
        # 5 years of experience (not the upper bound of an N-M range)
        r"(?<![-–—])(\d+)\s*years?(?:\s+of)?(?:\s+(?:professional|relevant|hands-?on|prior))?\s+experience",
        # 5+ years of Product Management / in software engineering
        r"(\d+)\s*\+\s*years?\s+(?:of|in)\s+",
        # at least / minimum
        r"at\s+least\s+(\d+)\s*years?",
        r"minimum\s+(?:of\s+)?(\d+)\s*years?",
        r"min(?:imum)?\.?\s+(\d+)\s*years?",
    )
)

_WHITESPACE_RE = re.compile(r"\s+")


def load_max_years_experience() -> float:
    """Max years a posting may require and still stay on the early-career list."""
    cfg = load_filters()
    return float(cfg.get("max_years_experience", 2))


def normalize_experience_text(text: str) -> str:
    if not text:
        return ""
    return _WHITESPACE_RE.sub(" ", text.lower()).strip()


def extract_min_years_required(text: str | None) -> Optional[float]:
    """Return the highest explicit minimum years requirement, or None."""
    if text is None or not str(text).strip():
        return None

    normalized = normalize_experience_text(text)
    found: list[float] = []
    for pattern in _YEAR_PATTERNS:
        for match in pattern.finditer(normalized):
            try:
                found.append(float(match.group(1)))
            except (TypeError, ValueError):
                continue
    return max(found) if found else None


def exceeds_max_years(
    min_years: float | None,
    *,
    max_years: float | None = None,
) -> bool:
    """True when the posting requires more years than the early-career cap."""
    if min_years is None:
        return False
    limit = load_max_years_experience() if max_years is None else max_years
    return float(min_years) > float(limit)
