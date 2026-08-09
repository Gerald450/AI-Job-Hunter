"""Job age parsing and max-age filtering."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from config import load_filters

_AGE_RE = re.compile(r"^(\d+)\s*([a-zA-Z]+)$")


def load_max_age_days() -> int:
    cfg = load_filters()
    return int(cfg.get("max_age_days", 30))


def age_to_hours(age: str) -> int | None:
    """Parse human age strings like ``2d`` / ``1mo`` into hours.

    Returns ``None`` when the string cannot be parsed (e.g. ``unknown``).
    """
    match = _AGE_RE.fullmatch((age or "").strip())
    if not match:
        return None

    value = int(match.group(1))
    unit = match.group(2).lower()

    if unit.startswith("h"):
        return value
    if unit.startswith("d"):
        return value * 24
    if unit.startswith("w"):
        return value * 24 * 7
    if unit.startswith("mo"):
        return value * 24 * 30
    if unit.startswith("y"):
        return value * 24 * 365
    return None


def datetime_to_age_string(posted_at: datetime, *, now: datetime | None = None) -> str:
    """Convert a posting timestamp into a compact age string (``3d``, ``2h``)."""
    current = now or datetime.now(timezone.utc)
    if posted_at.tzinfo is None:
        posted_at = posted_at.replace(tzinfo=timezone.utc)
    delta = current - posted_at.astimezone(timezone.utc)
    hours = max(0, int(delta.total_seconds() // 3600))
    if hours < 24:
        return f"{hours}h"
    days = hours // 24
    if days < 30:
        return f"{days}d"
    months = days // 30
    if months < 12:
        return f"{months}mo"
    return f"{days // 365}y"


def parse_posted_at(value: Any) -> datetime | None:
    """Parse common ATS timestamp formats into timezone-aware UTC datetimes."""
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
    if isinstance(value, (int, float)):
        # Lever uses milliseconds since epoch.
        ts = float(value)
        if ts > 1e12:
            ts /= 1000.0
        return datetime.fromtimestamp(ts, tz=timezone.utc)
    if isinstance(value, str) and value.strip():
        text = value.strip().replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(text)
        except ValueError:
            return None
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    return None


def is_within_max_age(
    *,
    age: str | None = None,
    posted_at: datetime | None = None,
    fallback_at: datetime | None = None,
    max_age_days: int | None = None,
    now: datetime | None = None,
) -> bool:
    """Return True when the job is at most ``max_age_days`` old.

    Preference order:
    1. ``posted_at`` timestamp
    2. parseable ``age`` string
    3. ``fallback_at`` (e.g. DB ``created_at``)
    4. if nothing known → keep (True)
    """
    limit_days = load_max_age_days() if max_age_days is None else max_age_days
    limit_hours = limit_days * 24
    current = now or datetime.now(timezone.utc)

    if posted_at is not None:
        if posted_at.tzinfo is None:
            posted_at = posted_at.replace(tzinfo=timezone.utc)
        hours = (current - posted_at.astimezone(timezone.utc)).total_seconds() / 3600
        return hours <= limit_hours

    hours = age_to_hours(age or "")
    if hours is not None:
        return hours <= limit_hours

    if fallback_at is not None:
        if fallback_at.tzinfo is None:
            fallback_at = fallback_at.replace(tzinfo=timezone.utc)
        hours = (current - fallback_at.astimezone(timezone.utc)).total_seconds() / 3600
        return hours <= limit_hours

    return True
