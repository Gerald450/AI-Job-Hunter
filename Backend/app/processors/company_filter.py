"""Company exclusion helpers backed by ``filters.yaml``."""

from __future__ import annotations

import re
from functools import lru_cache

from config import load_filters


@lru_cache(maxsize=1)
def load_excluded_companies() -> tuple[str, ...]:
    cfg = load_filters()
    raw = cfg.get("excluded_companies") or []
    if not isinstance(raw, list):
        return ()
    return tuple(str(name).strip() for name in raw if str(name).strip())


def is_excluded_company(company: str, excluded: tuple[str, ...] | None = None) -> bool:
    """Return True when ``company`` matches a configured non-sponsor name."""
    name = (company or "").strip().lower()
    if not name:
        return False
    needles = excluded if excluded is not None else load_excluded_companies()
    for needle in needles:
        key = needle.lower()
        if name == key or name.startswith(f"{key} ") or name.endswith(f" {key}"):
            return True
        # Whole-word / token match (e.g. "RTX Corp", "Foo RTX Bar")
        if re.search(rf"(?:^|[\s,./\-_]){re.escape(key)}(?:$|[\s,./\-_])", name):
            return True
    return False
