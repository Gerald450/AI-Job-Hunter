"""Config-driven role-family classification."""

from __future__ import annotations

from config import load_role_families


def classify_role_family(
    title: str,
    *,
    families: dict[str, list[str]] | None = None,
) -> str | None:
    """Return the first matching family name, or ``None`` if unmatched."""
    text = f" {(title or '').lower()} "
    mapping = families if families is not None else load_role_families()
    for family, patterns in mapping.items():
        for pattern in patterns:
            needle = pattern.lower().strip()
            if not needle:
                continue
            # Space-padded patterns (e.g. " apm ") avoid accidental substrings.
            if needle.startswith(" ") or needle.endswith(" ") or needle.endswith(","):
                if needle in text or needle.rstrip(",") in text:
                    return family
            elif needle in text:
                return family
    return None
