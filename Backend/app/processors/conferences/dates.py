"""Date parsing for conference records. Never invent dates."""

from __future__ import annotations

import calendar
import re
from datetime import date, datetime, timezone
from typing import Optional

_MONTHS = {name.lower(): index for index, name in enumerate(calendar.month_name) if name}
_MONTHS.update(
    {name.lower(): index for index, name in enumerate(calendar.month_abbr) if name}
)

_ISO_RE = re.compile(r"\b(20\d{2})-(\d{2})-(\d{2})\b")
_US_RE = re.compile(
    r"\b("
    + "|".join(re.escape(m) for m in _MONTHS)
    + r")\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*[–\-—/]\s*(\d{1,2})(?:st|nd|rd|th)?)?,?\s+(20\d{2})\b",
    re.IGNORECASE,
)
_RANGE_MONTHS_RE = re.compile(
    r"\b("
    + "|".join(re.escape(m) for m in _MONTHS)
    + r")\.?\s+(\d{1,2})(?:st|nd|rd|th)?\s*[–\-—]\s*("
    + "|".join(re.escape(m) for m in _MONTHS)
    + r")\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b",
    re.IGNORECASE,
)
_DAY_RANGE_WITH_CONTEXT_RE = re.compile(
    r"^\s*(\d{1,2})\s*[–\-—]\s*(\d{1,2})\s*$"
)
_ROLLING_RE = re.compile(r"\brolling(?:\s+deadline)?\b", re.IGNORECASE)


def _month_num(token: str) -> Optional[int]:
    return _MONTHS.get(token.lower().rstrip("."))


def parse_iso_date(value: object) -> Optional[date]:
    if value is None:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, (int, float)):
        # developers.events uses millisecond timestamps.
        ts = float(value)
        if ts > 10_000_000_000:
            ts = ts / 1000.0
        try:
            return datetime.fromtimestamp(ts, tz=timezone.utc).date()
        except (OSError, OverflowError, ValueError):
            return None
    text = str(value).strip()
    if not text:
        return None
    match = _ISO_RE.search(text)
    if match:
        try:
            return date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
        except ValueError:
            return None
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        return None


def parse_date_range(
    text: str | None,
    *,
    year: int | None = None,
    month: int | None = None,
) -> tuple[Optional[date], Optional[date]]:
    """Parse a human date or range. Returns (start, end); None if unknown."""
    if not text or not str(text).strip():
        return None, None
    blob = str(text).strip()

    iso_dates = [_safe_date(*m) for m in _ISO_RE.findall(blob)]
    iso_dates = [d for d in iso_dates if d]
    if len(iso_dates) >= 2:
        return iso_dates[0], iso_dates[1]
    if len(iso_dates) == 1:
        return iso_dates[0], iso_dates[0]

    ranged = _RANGE_MONTHS_RE.search(blob)
    if ranged:
        start_month = _month_num(ranged.group(1))
        end_month = _month_num(ranged.group(3))
        yr = int(ranged.group(5))
        if start_month and end_month:
            start = _safe_date(yr, start_month, int(ranged.group(2)))
            end = _safe_date(yr, end_month, int(ranged.group(4)))
            return start, end or start

    single = _US_RE.search(blob)
    if single:
        month_n = _month_num(single.group(1))
        yr = int(single.group(4))
        if month_n:
            start = _safe_date(yr, month_n, int(single.group(2)))
            end_day = single.group(3)
            end = _safe_date(yr, month_n, int(end_day)) if end_day else start
            return start, end or start

    days = _DAY_RANGE_WITH_CONTEXT_RE.match(blob)
    if days and year and month:
        start = _safe_date(year, month, int(days.group(1)))
        end = _safe_date(year, month, int(days.group(2)))
        return start, end or start

    if year and month:
        day_match = re.match(r"^\s*(\d{1,2})\s*$", blob)
        if day_match:
            start = _safe_date(year, month, int(day_match.group(1)))
            return start, start

    return None, None


def _safe_date(year: int, month: int, day: int) -> Optional[date]:
    try:
        return date(int(year), int(month), int(day))
    except ValueError:
        return None


def is_rolling(text: str | None) -> bool:
    if not text:
        return False
    return _ROLLING_RE.search(text) is not None


def days_until(deadline: Optional[date], *, today: Optional[date] = None) -> Optional[int]:
    if deadline is None:
        return None
    current = today or date.today()
    return (deadline - current).days


def is_expired(deadline: Optional[date], *, today: Optional[date] = None) -> bool:
    delta = days_until(deadline, today=today)
    return delta is not None and delta < 0


def is_closing_soon(
    deadline: Optional[date],
    *,
    today: Optional[date] = None,
    window_days: int = 14,
) -> bool:
    delta = days_until(deadline, today=today)
    return delta is not None and 0 <= delta <= window_days


def soonest_future(
    dates: list[Optional[date]],
    *,
    today: Optional[date] = None,
) -> Optional[date]:
    current = today or date.today()
    future = [d for d in dates if d is not None and d >= current]
    return min(future) if future else None
