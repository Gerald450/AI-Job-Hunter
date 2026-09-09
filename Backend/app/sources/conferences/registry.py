"""Build enabled conference list sources from config."""

from __future__ import annotations

from typing import Any

from config import conference_provider_enabled, load_conference_providers
from fetchers.conferences.http import RobotsChecker
from sources.conferences.awesome_ai import AwesomeAIConferenceFetcher
from sources.conferences.base import ConferenceListSource
from sources.conferences.developers_events import DevelopersConferenceFetcher
from sources.conferences.official import (
    AAAIConferenceFetcher,
    ACLConferenceFetcher,
    ACMConferenceFetcher,
    CVPRConferenceFetcher,
    ICLRConferenceFetcher,
    ICMLConferenceFetcher,
    IEEEConferenceFetcher,
    NeurIPSConferenceFetcher,
    USENIXConferenceFetcher,
)


def build_conference_sources(
    *,
    providers: dict[str, Any] | None = None,
    robots: RobotsChecker | None = None,
) -> list[ConferenceListSource]:
    cfg = providers if providers is not None else load_conference_providers()
    checker = robots if robots is not None else RobotsChecker()
    sources: list[ConferenceListSource] = []

    def _delay(name: str) -> int:
        return int((cfg.get(name) or {}).get("request_delay_ms", 300))

    mapping: list[tuple[str, type]] = [
        ("developers_events", DevelopersConferenceFetcher),
        ("awesome_ai", AwesomeAIConferenceFetcher),
        ("usenix", USENIXConferenceFetcher),
        ("neurips", NeurIPSConferenceFetcher),
        ("icml", ICMLConferenceFetcher),
        ("iclr", ICLRConferenceFetcher),
        ("aaai", AAAIConferenceFetcher),
        ("cvpr", CVPRConferenceFetcher),
        ("acl", ACLConferenceFetcher),
        ("acm", ACMConferenceFetcher),
        ("ieee", IEEEConferenceFetcher),
    ]
    for key, cls in mapping:
        if not conference_provider_enabled(key, cfg):
            continue
        sources.append(
            cls(robots=checker, delay_ms=_delay(key))  # type: ignore[call-arg]
        )
    return sources
