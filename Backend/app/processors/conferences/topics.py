"""Config-driven topic tagging for conferences."""

from __future__ import annotations

from typing import Any

from config import load_conference_topics


def classify_topics(
    *parts: str | None,
    families: dict[str, list[str]] | None = None,
) -> list[str]:
    data = families if families is not None else load_conference_topics()
    mapping = data.get("families") or data
    blob = " ".join(p or "" for p in parts).lower()
    if not blob.strip():
        return []
    hits: list[str] = []
    for family, patterns in mapping.items():
        if family == "irrelevant":
            continue
        for pattern in patterns or []:
            needle = str(pattern).lower().strip()
            if needle and needle in blob:
                hits.append(str(family))
                break
    return hits


def is_irrelevant(*parts: str | None, config: dict[str, Any] | None = None) -> bool:
    data = config if config is not None else load_conference_topics()
    blob = " ".join(p or "" for p in parts).lower()
    if classify_topics(*parts, families=data.get("families") if "families" in data else data):
        return False
    for pattern in data.get("irrelevant") or []:
        if str(pattern).lower() in blob:
            return True
    return False
