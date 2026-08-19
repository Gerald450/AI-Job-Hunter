"""Name and URL helpers for conference deduplication."""

from __future__ import annotations

import re
from typing import Optional

_YEAR_RE = re.compile(r"\b20\d{2}\b")
_PUNCT_RE = re.compile(r"[^\w\s]+", re.UNICODE)
_WS_RE = re.compile(r"\s+")
_ORDINAL_RE = re.compile(
    r"\b(\d+)(st|nd|rd|th)\b|\b(first|second|third|fourth|fifth|"
    r"sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|"
    r"thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|"
    r"eighteenth|nineteenth|twentieth|twenty[- ]?first|"
    r"twenty[- ]?second|twenty[- ]?third)\b",
    re.IGNORECASE,
)
_FILLER_RE = re.compile(
    r"\b(the|annual|international|conference|on|symposium|"
    r"workshop|proceedings)\b",
    re.IGNORECASE,
)


def normalize_conference_name(name: str | None) -> str:
    if not name:
        return ""
    text = name.strip().lower()
    text = _YEAR_RE.sub(" ", text)
    text = _ORDINAL_RE.sub(" ", text)
    text = _PUNCT_RE.sub(" ", text)
    text = _FILLER_RE.sub(" ", text)
    text = _WS_RE.sub(" ", text).strip()
    return text


def normalize_org(organization: str | None) -> str:
    if not organization:
        return ""
    return _WS_RE.sub(" ", organization.strip().lower())


OFFICIAL_SOURCE_PRIORITY = (
    "neurips",
    "icml",
    "iclr",
    "aaai",
    "cvpr",
    "usenix",
    "acl",
    "acm",
    "ieee",
)

COMMUNITY_SOURCES = frozenset(
    {
        "developers_events",
        "developers-conferences-agenda",
        "awesome_ai",
        "awesome-ai-conferences",
    }
)


def source_rank(source: str | None) -> int:
    name = (source or "").lower()
    if name in OFFICIAL_SOURCE_PRIORITY:
        return OFFICIAL_SOURCE_PRIORITY.index(name)
    if name in COMMUNITY_SOURCES:
        return 50
    return 40


def is_official_source(source: str | None) -> bool:
    return source_rank(source) < 40


def prefer_text(official: Optional[str], community: Optional[str]) -> Optional[str]:
    if official and str(official).strip():
        return official
    if community and str(community).strip():
        return community
    return None
