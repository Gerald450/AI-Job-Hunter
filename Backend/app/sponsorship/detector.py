"""Deterministic sponsorship detector (pattern matching only, no LLM)."""

from __future__ import annotations

import re

from sponsorship.models import SponsorshipResult
from sponsorship.patterns import NO_SPONSORSHIP_PATTERNS, YES_SPONSORSHIP_PATTERNS

_WHITESPACE_RE = re.compile(r"\s+")


def normalize_description(description: str) -> str:
    """Lowercase and collapse whitespace; keep punctuation for regex fidelity."""
    if not description:
        return ""
    return _WHITESPACE_RE.sub(" ", description.lower()).strip()


def _first_match(
    text: str,
    patterns: tuple[re.Pattern[str], ...],
) -> str | None:
    for pattern in patterns:
        match = pattern.search(text)
        if match:
            return match.group(0)
    return None


class SponsorshipDetector:
    """Pure, deterministic sponsorship phrase matcher.

    No database access, networking, or company-based inference.
    """

    def detect(self, description: str | None) -> SponsorshipResult:
        """Classify sponsorship from text explicitly present in ``description``."""
        if description is None or not str(description).strip():
            return SponsorshipResult(
                sponsorship=None,
                matched_phrase=None,
                confidence=0.0,
            )

        normalized = normalize_description(description)

        denied = _first_match(normalized, NO_SPONSORSHIP_PATTERNS)
        if denied is not None:
            return SponsorshipResult(
                sponsorship=False,
                matched_phrase=denied,
                confidence=1.0,
            )

        offered = _first_match(normalized, YES_SPONSORSHIP_PATTERNS)
        if offered is not None:
            return SponsorshipResult(
                sponsorship=True,
                matched_phrase=offered,
                confidence=1.0,
            )

        return SponsorshipResult(
            sponsorship=None,
            matched_phrase=None,
            confidence=0.0,
        )
