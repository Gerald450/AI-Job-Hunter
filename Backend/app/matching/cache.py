"""Hash helpers for resume analysis caching."""

from __future__ import annotations

import hashlib


def hash_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def description_hash(description: str) -> str:
    return hash_text(description.strip())
