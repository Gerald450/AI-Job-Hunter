"""Config-driven early-career title filter."""

from __future__ import annotations

import re
from typing import Any

from config import load_early_career


def _pattern(needle: str) -> re.Pattern[str]:
    text = needle.strip().lower()
    # Space-aware literals from config (e.g. " lead ", " apm ").
    if text.startswith(" ") or text.endswith(" "):
        return re.compile(re.escape(text.strip()), re.IGNORECASE)
    return re.compile(rf"\b{re.escape(text)}\b", re.IGNORECASE)


def _matches_any(title: str, needles: list[str]) -> bool:
    return any(_pattern(n).search(title) for n in needles if n and n.strip())


def is_early_career(
    title: str,
    *,
    rules: dict[str, Any] | None = None,
) -> bool:
    """Return True when ``title`` looks early-career per config rules."""
    cfg = rules if rules is not None else load_early_career()
    raw = (title or "").strip()
    if not raw:
        return False

    reject = [str(x) for x in (cfg.get("reject") or [])]
    accept = [str(x) for x in (cfg.get("accept") or [])]
    exceptions = [str(x) for x in (cfg.get("reject_exceptions") or [])]
    overrides = [str(x) for x in (cfg.get("accept_overrides") or [])]
    allow_unmarked = bool(cfg.get("allow_unmarked", True))

    exception_hit = _matches_any(raw, exceptions)

    hard_reject = {
        "internship",
        "intern",
        "co-op",
        "coop",
        "senior",
        "sr",
        "staff",
        "principal",
        "director",
        "distinguished",
        "fellow",
        "architect",
        "vp",
        "vice president",
        "lead",
    }
    if exception_hit:
        reject_hit = _matches_any(
            raw, [n for n in reject if n.strip().lower() in hard_reject]
        )
    else:
        reject_hit = _matches_any(raw, reject)

    if reject_hit:
        return _matches_any(raw, overrides)

    if _matches_any(raw, accept):
        return True

    return allow_unmarked
