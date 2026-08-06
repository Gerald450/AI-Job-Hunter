"""Build enabled ``ListSource`` providers from config."""

from __future__ import annotations

from typing import Any

from config import load_companies, load_providers, provider_enabled
from sources.ashby import AshbyBoardSource
from sources.base import ListSource
from sources.greenhouse import GreenhouseBoardSource
from sources.lever import LeverBoardSource
from sources.pittcsc import PittcscListSource
from sources.simplify import SimplifyListSource


def build_list_sources(
    *,
    companies: list[dict[str, Any]] | None = None,
    providers: dict[str, Any] | None = None,
) -> list[ListSource]:
    """Instantiate every enabled discovery source."""
    cfg = providers if providers is not None else load_providers()
    company_rows = companies if companies is not None else load_companies()
    sources: list[ListSource] = []

    if provider_enabled("pittcsc", cfg):
        sources.append(PittcscListSource())

    if provider_enabled("simplify", cfg):
        sources.append(SimplifyListSource())

    if provider_enabled("greenhouse", cfg):
        g_cfg = cfg.get("greenhouse") or {}
        sources.append(
            GreenhouseBoardSource(
                company_rows,
                timeout_seconds=float(g_cfg.get("timeout_seconds", 30)),
                request_delay_ms=int(g_cfg.get("request_delay_ms", 0)),
            )
        )

    if provider_enabled("ashby", cfg):
        a_cfg = cfg.get("ashby") or {}
        sources.append(
            AshbyBoardSource(
                company_rows,
                timeout_seconds=float(a_cfg.get("timeout_seconds", 30)),
                request_delay_ms=int(a_cfg.get("request_delay_ms", 0)),
            )
        )

    if provider_enabled("lever", cfg):
        l_cfg = cfg.get("lever") or {}
        sources.append(
            LeverBoardSource(
                company_rows,
                timeout_seconds=float(l_cfg.get("timeout_seconds", 30)),
                request_delay_ms=int(l_cfg.get("request_delay_ms", 0)),
            )
        )

    return sources
