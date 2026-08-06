"""Load YAML configuration for aggregation providers and filters."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

_CONFIG_DIR = Path(__file__).resolve().parent


def _load_yaml(name: str) -> dict[str, Any]:
    path = _CONFIG_DIR / name
    with path.open(encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}
    if not isinstance(data, dict):
        raise ValueError(f"Config {name} must be a mapping")
    return data


def load_companies() -> list[dict[str, Any]]:
    data = _load_yaml("companies.yaml")
    companies = data.get("companies") or []
    if not isinstance(companies, list):
        raise ValueError("companies.yaml: 'companies' must be a list")
    return [c for c in companies if isinstance(c, dict)]


def load_role_families() -> dict[str, list[str]]:
    data = _load_yaml("role_families.yaml")
    families = data.get("families") or {}
    if not isinstance(families, dict):
        raise ValueError("role_families.yaml: 'families' must be a mapping")
    return {
        str(name): [str(p) for p in (patterns or [])]
        for name, patterns in families.items()
    }


def load_early_career() -> dict[str, Any]:
    return _load_yaml("early_career.yaml")


def load_filters() -> dict[str, Any]:
    return _load_yaml("filters.yaml")


def load_providers() -> dict[str, Any]:
    data = _load_yaml("providers.yaml")
    defaults = data.get("defaults") or {}
    providers = data.get("providers") or {}
    merged: dict[str, Any] = {}
    for name, overrides in providers.items():
        settings = dict(defaults)
        if isinstance(overrides, dict):
            settings.update(overrides)
        merged[str(name)] = settings
    return merged


def provider_enabled(name: str, providers: dict[str, Any] | None = None) -> bool:
    cfg = (providers or load_providers()).get(name) or {}
    return bool(cfg.get("enabled", True))
