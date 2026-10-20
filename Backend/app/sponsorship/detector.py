"""Deterministic sponsorship detector (pattern matching only, no LLM)."""

from __future__ import annotations

import re

from sponsorship.models import SponsorshipResult
from sponsorship.patterns import (
    CITIZENSHIP_REQUIRED_PATTERNS,
    CLEARANCE_REQUIRED_PATTERNS,
    NO_SPONSORSHIP_PATTERNS,
    YES_SPONSORSHIP_PATTERNS,
)

# Negation must sit in the same sentence as the clearance phrase.
_CLEARANCE_BEFORE_NEGATION = re.compile(
    r"(?:\bno|\bnot|\bwithout|\bdoes not|\bdo not|\bdoesn'?t|\bwill not|\bwon'?t)\b"
)
_CLEARANCE_AFTER_NEGATION = re.compile(
    r"^\s*(?:is\s+|are\s+)?not\s+(?:a\s+)?(?:requirement|required|needed|necessary)"
    r"|^\s*isn'?t\s+(?:a\s+)?(?:requirement|required|needed|necessary)"
)

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


def detect_citizenship_required(description: str | None) -> str | None:
    """Return the matched citizenship phrase, or None if not required."""
    if description is None or not str(description).strip():
        return None
    return _first_match(normalize_description(description), CITIZENSHIP_REQUIRED_PATTERNS)


def _clearance_span_is_negated(text: str, start: int, end: int) -> bool:
    """True when nearby words say a clearance is not required."""
    before = text[max(0, start - 80) : start]
    if "." in before:
        before = before.rsplit(".", 1)[-1]
    after = text[end : end + 48]
    if _CLEARANCE_AFTER_NEGATION.search(after):
        return True
    negation = _CLEARANCE_BEFORE_NEGATION.search(before)
    if negation is None:
        return False
    # "will not sponsor, but a secret clearance is required" is still a hit.
    between = before[negation.end() :]
    if re.search(r"\b(?:but|however)\b", between):
        return False
    return True


def detect_clearance_required(description: str | None) -> str | None:
    """Return the matched clearance phrase, or None if not required.

    Covers Secret, Top Secret, TS/SCI, and "security clearance" requirements.
    A nearby denial ("no security clearance required") does not count.
    """
    if description is None or not str(description).strip():
        return None
    text = normalize_description(description)
    for pattern in CLEARANCE_REQUIRED_PATTERNS:
        for match in pattern.finditer(text):
            if _clearance_span_is_negated(text, match.start(), match.end()):
                continue
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
