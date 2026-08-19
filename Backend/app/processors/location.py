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

_VIRTUAL_RE = re.compile(
    r"\b("
    r"virtual(?:ized)?"
    r"|online(?:[- ]only)?"
    r"|fully[- ]online"
    r"|remote[- ]only"
    r"|livestream"
    r"|zoom"
    r"|worldwide[- ]online"
    r")\b",
    re.IGNORECASE,
)

_US_TERRITORY_RE = re.compile(
    r"\b("
    r"puerto rico|guam|american samoa|u\.?s\.?\s*virgin islands|"
    r"virgin islands|northern mariana islands|usa?[- ]?territor"
    r")\b",
    re.IGNORECASE,
)

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


def has_non_us_signal(location: str) -> bool:
    """Return True if ``location`` mentions a clear non-US place."""
    if not location:
        return False
    return _NON_US_RE.search(location) is not None


def is_virtual_location(location: str | None, *, is_virtual: bool | None = None) -> bool:
    """True when the venue is online/virtual rather than a physical city."""
    if is_virtual is True:
        return True
    if not location:
        return False
    text = location.strip()
    if not text:
        return False
    if _VIRTUAL_RE.search(text):
        return True
    lowered = text.lower()
    return lowered in {"online", "virtual", "remote", "worldwide"}


def classify_conference_location(
    location: str | None,
    *,
    is_virtual: bool | None = None,
) -> str:
    """Classify a conference venue: US, VIRTUAL, NON_US, or UNKNOWN.

    Organization names must not be passed in as ``location``.
    Bare ``Remote`` is VIRTUAL for conferences (jobs still treat it as US).
    """
    text = (location or "").strip()
    empty = (not text) or text.lower() in {"unknown", "n/a", "na", "none", "-"}
    if empty:
        return "VIRTUAL" if is_virtual is True else "UNKNOWN"

    us = has_us_signal(text) or _US_TERRITORY_RE.search(text) is not None
    non_us = has_non_us_signal(text)
    virtual = is_virtual_location(text, is_virtual=is_virtual)

    if us:
        return "US"
    if virtual and not non_us:
        return "VIRTUAL"
    if virtual and non_us and re.search(
        r"^\s*(online|virtual|remote)\b", text, re.IGNORECASE
    ):
        return "VIRTUAL"
    if non_us:
        return "NON_US"
    if virtual:
        return "VIRTUAL"
    return "UNKNOWN"


_CITY_STATE_RE = re.compile(
    r"^\s*([^,]+),\s*([A-Z]{2})(?:\s*,?\s*(?:USA|U\.S\.A\.|United States))?\s*$",
    re.IGNORECASE,
)
_CITY_COUNTRY_RE = re.compile(
    r"^\s*(.+?)\s*\(([^)]+)\)\s*$",
)
_STATE_NAME_TO_ABBR: dict[str, str] = {
    "alabama": "AL",
    "alaska": "AK",
    "arizona": "AZ",
    "arkansas": "AR",
    "california": "CA",
    "colorado": "CO",
    "connecticut": "CT",
    "delaware": "DE",
    "florida": "FL",
    "georgia": "GA",
    "hawaii": "HI",
    "idaho": "ID",
    "illinois": "IL",
    "indiana": "IN",
    "iowa": "IA",
    "kansas": "KS",
    "kentucky": "KY",
    "louisiana": "LA",
    "maine": "ME",
    "maryland": "MD",
    "massachusetts": "MA",
    "michigan": "MI",
    "minnesota": "MN",
    "mississippi": "MS",
    "missouri": "MO",
    "montana": "MT",
    "nebraska": "NE",
    "nevada": "NV",
    "new hampshire": "NH",
    "new jersey": "NJ",
    "new mexico": "NM",
    "new york": "NY",
    "north carolina": "NC",
    "north dakota": "ND",
    "ohio": "OH",
    "oklahoma": "OK",
    "oregon": "OR",
    "pennsylvania": "PA",
    "rhode island": "RI",
    "south carolina": "SC",
    "south dakota": "SD",
    "tennessee": "TN",
    "texas": "TX",
    "utah": "UT",
    "vermont": "VT",
    "virginia": "VA",
    "washington": "WA",
    "west virginia": "WV",
    "wisconsin": "WI",
    "wyoming": "WY",
    "district of columbia": "DC",
}


def parse_location_parts(location: str | None) -> tuple[str | None, str | None, str | None]:
    """Best-effort city, state, country from a raw location string.

    Returns ``(city, state, country)``. Unknown parts are None — never guessed
    from the organization name.
    """
    if not location:
        return None, None, None
    text = location.strip()
    if not text or text.lower() in {"unknown", "n/a", "na", "none", "-"}:
        return None, None, None
    if is_virtual_location(text):
        return None, None, None

    match = _CITY_STATE_RE.match(text)
    if match:
        city = match.group(1).strip()
        state = match.group(2).upper()
        return city, state, "United States"

    paren = _CITY_COUNTRY_RE.match(text)
    if paren:
        city = paren.group(1).strip().rstrip(",")
        country_raw = paren.group(2).strip()
        country_lower = country_raw.lower()
        if country_lower in {"usa", "us", "u.s.", "u.s.a.", "united states"}:
            # "Santa Clara, CA (USA)" or "New York, NY (USA)"
            inner = _CITY_STATE_RE.match(city) or _CITY_STATE_RE.match(
                city + ", USA"
            )
            if "," in city:
                bits = [b.strip() for b in city.split(",")]
                if len(bits) >= 2 and bits[-1].upper() in _US_STATE_ABBR:
                    return bits[0], bits[-1].upper(), "United States"
                if len(bits) >= 2 and bits[-1].lower() in _STATE_NAME_TO_ABBR:
                    return bits[0], _STATE_NAME_TO_ABBR[bits[-1].lower()], "United States"
            return city, None, "United States"
        country = country_raw
        if country_lower in {"uk", "u.k.", "united kingdom", "england"}:
            country = "United Kingdom"
        elif country_lower == "canada":
            country = "Canada"
        return city, None, country

    if has_us_signal(text) and not has_non_us_signal(text):
        bits = [b.strip() for b in text.split(",") if b.strip()]
        if len(bits) >= 2 and bits[1].upper()[:2] in _US_STATE_ABBR:
            return bits[0], bits[1].upper()[:2], "United States"
        return bits[0] if bits else None, None, "United States"

    return None, None, None


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
