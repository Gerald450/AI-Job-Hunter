"""Location heuristics for keeping only US-based (or US-remote) roles."""

from __future__ import annotations

import re

# Two-letter US state / DC codes. Matched as whole tokens so "OR" does not
# match inside "Toronto" and "IN" does not match the English word "in".
_US_STATE_ABBR: frozenset[str] = frozenset(
    {
        "AL",
        "AK",
        "AZ",
        "AR",
        "CA",
        "CO",
        "CT",
        "DE",
        "DC",
        "FL",
        "GA",
        "HI",
        "ID",
        "IL",
        "IN",
        "IA",
        "KS",
        "KY",
        "LA",
        "ME",
        "MD",
        "MA",
        "MI",
        "MN",
        "MS",
        "MO",
        "MT",
        "NE",
        "NV",
        "NH",
        "NJ",
        "NM",
        "NY",
        "NC",
        "ND",
        "OH",
        "OK",
        "OR",
        "PA",
        "RI",
        "SC",
        "SD",
        "TN",
        "TX",
        "UT",
        "VT",
        "VA",
        "WA",
        "WV",
        "WI",
        "WY",
    }
)

_US_STATE_NAMES: tuple[str, ...] = (
    "alabama",
    "alaska",
    "arizona",
    "arkansas",
    "california",
    "colorado",
    "connecticut",
    "delaware",
    "florida",
    "georgia",
    "hawaii",
    "idaho",
    "illinois",
    "indiana",
    "iowa",
    "kansas",
    "kentucky",
    "louisiana",
    "maine",
    "maryland",
    "massachusetts",
    "michigan",
    "minnesota",
    "mississippi",
    "missouri",
    "montana",
    "nebraska",
    "nevada",
    "new hampshire",
    "new jersey",
    "new mexico",
    "new york",
    "north carolina",
    "north dakota",
    "ohio",
    "oklahoma",
    "oregon",
    "pennsylvania",
    "rhode island",
    "south carolina",
    "south dakota",
    "tennessee",
    "texas",
    "utah",
    "vermont",
    "virginia",
    "washington",
    "west virginia",
    "wisconsin",
    "wyoming",
    "district of columbia",
)

# Short city tags used heavily on PittCSC / SimplifyJobs READMEs.
_US_CITY_TAGS: frozenset[str] = frozenset(
    {
        "SF",
        "NYC",
        "LA",
        "ATL",
        "ATX",
        "SEA",
        "BOS",
        "CHI",
        "DEN",
        "PHX",
        "PDX",
        "DFW",
        "PHL",
        "MSP",
        "DTW",
        "RDU",
        "AUS",
        "SJC",
        "SV",
        "BAY AREA",
    }
)

_US_COUNTRY_RE = re.compile(
    r"\b("
    r"united states(?: of america)?"
    r"|u\.?\s*s\.?a\.?"
    r"|u\.?\s*s\.?"
    r"|usa"
    r")\b",
    re.IGNORECASE,
)

_REMOTE_US_RE = re.compile(
    r"\bremote\b.*\b(united states|u\.?s\.?a\.?|u\.?s\.?|usa)\b"
    r"|\b(united states|u\.?s\.?a\.?|u\.?s\.?|usa)\b.*\bremote\b"
    r"|\bremote in usa\b"
    r"|\bus[- ]?remote\b"
    r"|\bremote[- ]?us\b",
    re.IGNORECASE,
)

_BARE_REMOTE_RE = re.compile(r"^\s*remote\s*$", re.IGNORECASE)

# Clear non-US markers. A job can still pass if it also has a US signal
# (e.g. "NYC / Toronto" → keep because NYC is US).
_NON_US_RE = re.compile(
    r"\b("
    r"united kingdom|u\.?k\.?|england|scotland|wales|london|manchester|cambridge,?\s*uk"
    r"|canada|toronto|vancouver|montreal|ottawa|calgary|waterloo"
    r"|india|bangalore|bengaluru|hyderabad|mumbai|pune|chennai|delhi"
    r"|germany|berlin|munich|münchen|frankfurt"
    r"|france|paris|lyon"
    r"|netherlands|amsterdam"
    r"|ireland|dublin"
    r"|australia|sydney|melbourne"
    r"|singapore|japan|tokyo|china|beijing|shanghai|hong kong"
    r"|brazil|mexico|israel|tel aviv|sweden|stockholm|switzerland|zurich"
    r"|poland|warsaw|spain|madrid|barcelona|italy|milan|rome"
    r"|south korea|seoul|taiwan|taipei|philippines|manila"
    r"|emea|apac|latam|eu[- ]?only|europe only"
    r")\b",
    re.IGNORECASE,
)


def _has_us_state_abbr(location: str) -> bool:
    """True when a US state/DC abbreviation appears as its own token."""
    # Prefer ", XX" / " XX " / end-of-string patterns used in "City, ST".
    for match in re.finditer(r"(?<![A-Za-z])([A-Z]{2})(?![A-Za-z])", location.upper()):
        if match.group(1) in _US_STATE_ABBR:
            return True
    return False


def _has_us_state_name(location: str) -> bool:
    lower = location.lower()
    return any(re.search(rf"\b{re.escape(name)}\b", lower) for name in _US_STATE_NAMES)


def _has_us_city_tag(location: str) -> bool:
    upper = location.upper()
    for tag in _US_CITY_TAGS:
        if re.search(rf"(?<![A-Z]){re.escape(tag)}(?![A-Z])", upper):
            return True
    return False


def has_us_signal(location: str) -> bool:
    """Return True if ``location`` mentions any US place / remote-US marker."""
    if not location:
        return False
    if _US_COUNTRY_RE.search(location) or _REMOTE_US_RE.search(location):
        return True
    if _has_us_state_abbr(location) or _has_us_state_name(location):
        return True
    if _has_us_city_tag(location):
        return True
    return False


def is_us_location(location: str | None) -> bool:
    """Return True when a job location is US-based (or US-remote).

    Rules (in order):
    1. Empty / unknown → reject.
    2. Any explicit US signal → accept (even if other countries are listed).
    3. Explicit non-US-only locations → reject.
    4. Bare ``Remote`` → accept (these list sources are US-centric).
    5. Otherwise → reject.
    """
    if location is None:
        return False
    text = location.strip()
    if not text or text.lower() in {"unknown", "n/a", "na", "none", "-"}:
        return False

    if has_us_signal(text):
        return True

    if _NON_US_RE.search(text):
        return False

    if _BARE_REMOTE_RE.match(text):
        return True

    return False
