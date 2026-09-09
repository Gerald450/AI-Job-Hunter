"""Parallel conference aggregation: fetch, normalize, dedupe, filter, score."""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Optional

from config import load_conference_profile
from fetchers.conferences.funding import ConferenceFundingFetcher
from fetchers.conferences.http import RobotsChecker
from fetchers.conferences.official import OfficialPageVerifier
from fetchers.exceptions import FetchError
from model.conference import Conference, FundingStatus, LocationStatus
from processors.conferences.dedupe import deduplicate
from processors.conferences.eligibility import evaluate_conference
from processors.conferences.feed import has_student_funding, should_persist_conference
from processors.conferences.matching import score_conference
from processors.conferences.topics import classify_topics
from processors.location import classify_conference_location, parse_location_parts
from sources.conferences.base import ConferenceListSource, ConferenceProviderResult
from sources.conferences.registry import build_conference_sources

logger = logging.getLogger(__name__)


@dataclass
class ConferenceAggregationStats:
    providers: list[ConferenceProviderResult] = field(default_factory=list)
    fetched: int = 0
    after_dedupe: int = 0
    duplicates_skipped: int = 0
    verified: int = 0
    verify_failed: int = 0
    elapsed_ms: float = 0.0

    @property
    def failures(self) -> list[ConferenceProviderResult]:
        return [p for p in self.providers if not p.ok]


class ConferenceAggregationService:
    def __init__(
        self,
        sources: list[ConferenceListSource] | None = None,
        *,
        profile: dict[str, Any] | None = None,
        robots: RobotsChecker | None = None,
        verify_delay_ms: int = 300,
    ) -> None:
        self._robots = robots if robots is not None else RobotsChecker()
        self._sources = (
            sources
            if sources is not None
            else build_conference_sources(robots=self._robots)
        )
        self._profile = profile if profile is not None else load_conference_profile()
        self._verify_delay_ms = verify_delay_ms

    async def aggregate(self, *, verify: bool = False, verify_limit: int | None = None) -> tuple[list[Conference], ConferenceAggregationStats]:
        started = time.perf_counter()
        results = await asyncio.gather(
            *[self._run_provider(source) for source in self._sources]
        )
        provider_results = list(results)
        combined: list[Conference] = []
        for result in provider_results:
            combined.extend(result.conferences)

        deduped, dupes = deduplicate(combined)
        evaluated = [self._evaluate(conference) for conference in deduped]

        verified_count = 0
        verify_failed = 0
        if verify:
            evaluated, verified_count, verify_failed = await self._verify_many(
                evaluated, limit=verify_limit
            )

        kept: list[Conference] = []
        for conference in evaluated:
            if not should_persist_conference(conference):
                continue
            if conference.funding_available is not True and has_student_funding(
                conference
            ):
                conference.funding_available = True
            kept.append(conference)
        dropped = len(evaluated) - len(kept)
        if dropped:
            logger.info(
                "Dropped %s conferences that are online, unfunded, or already ended",
                dropped,
            )

        stats = ConferenceAggregationStats(
            providers=provider_results,
            fetched=len(combined),
            after_dedupe=len(kept),
            duplicates_skipped=dupes,
            verified=verified_count,
            verify_failed=verify_failed,
            elapsed_ms=(time.perf_counter() - started) * 1000,
        )
        self._log_stats(stats)
        return kept, stats

    async def _run_provider(self, source: ConferenceListSource) -> ConferenceProviderResult:
        started = time.perf_counter()
        try:
            conferences = await source.fetch_conferences()
            unreliable = bool(getattr(source, "unreliable", False))
            return ConferenceProviderResult(
                provider=source.name,
                conferences=conferences,
                unreliable=unreliable,
                elapsed_ms=(time.perf_counter() - started) * 1000,
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("Conference provider failed: %s", source.name)
            return ConferenceProviderResult(
                provider=source.name,
                conferences=[],
                error=str(exc),
                elapsed_ms=(time.perf_counter() - started) * 1000,
            )

    def _evaluate(self, conference: Conference) -> Conference:
        if not conference.topics:
            conference.topics = classify_topics(
                conference.name, conference.description, conference.conference_type
            )
        evaluate_conference(conference, self._profile)
        score_conference(conference, self._profile)
        return conference

    async def _verify_many(
        self,
        conferences: list[Conference],
        *,
        limit: int | None,
    ) -> tuple[list[Conference], int, int]:
        verifier = OfficialPageVerifier(
            robots=self._robots, delay_ms=self._verify_delay_ms
        )
        funding_fetcher = ConferenceFundingFetcher(
            robots=self._robots, delay_ms=self._verify_delay_ms
        )
        candidates = [
            c
            for c in conferences
            if c.official_url
            and c.location_status != LocationStatus.NON_US
        ]
        if limit is not None:
            candidates = candidates[: max(0, limit)]
        verify_ids = {id(c) for c in candidates}
        verified = 0
        failed = 0
        out: list[Conference] = []
        for conference in conferences:
            if id(conference) not in verify_ids:
                out.append(conference)
                continue
            try:
                updated = await self._verify_one(
                    conference, verifier=verifier, funding_fetcher=funding_fetcher
                )
                verified += 1
                out.append(updated)
            except FetchError as exc:
                logger.info("Verify skipped %s: %s", conference.official_url, exc)
                failed += 1
                out.append(conference)
            except Exception:  # noqa: BLE001
                logger.exception("Verify failed %s", conference.official_url)
                failed += 1
                out.append(conference)
        return out, verified, failed

    async def _verify_one(
        self,
        conference: Conference,
        *,
        verifier: OfficialPageVerifier,
        funding_fetcher: ConferenceFundingFetcher,
    ) -> Conference:
        assert conference.official_url
        facts = await verifier.verify(conference.official_url)
        updated = overlay_official_facts(conference, facts)
        grants, funding_status, summary = await funding_fetcher.fetch(
            conference.official_url,
            conference_name=updated.name,
            page_html=None,
            child_links=facts.get("child_links") or [],
        )
        updated.funding = grants
        updated.funding_status = funding_status
        if summary.get("funding_available") is not None:
            updated.funding_available = summary.get("funding_available")
        if summary.get("travel_grant_available") is not None:
            updated.travel_grant_available = summary.get("travel_grant_available")
        if summary.get("registration_waiver_available") is not None:
            updated.registration_waiver_available = summary.get(
                "registration_waiver_available"
            )
        if summary.get("scholarship_available") is not None:
            updated.scholarship_available = summary.get("scholarship_available")
        if summary.get("funding_amount"):
            updated.funding_amount = summary.get("funding_amount")
        if summary.get("funding_deadline"):
            updated.funding_deadline = summary.get("funding_deadline")
        if summary.get("funding_requirements"):
            updated.funding_requirements = summary.get("funding_requirements")
        if facts.get("page_text") and not updated.description:
            updated.description = str(facts["page_text"])[:2000]
        if facts.get("page_text") and not updated.eligibility_requirements:
            # Keep raw eligibility snippets only if the page mentions eligibility.
            blob = str(facts["page_text"])
            lowered = blob.lower()
            if "eligib" in lowered or "student" in lowered:
                updated.eligibility_requirements = blob[:1500]
        return self._evaluate(updated)

    @staticmethod
    def _log_stats(stats: ConferenceAggregationStats) -> None:
        for result in stats.providers:
            if result.ok:
                logger.info(
                    "Conference provider %s ok n=%s unreliable=%s elapsed_ms=%.0f",
                    result.provider,
                    len(result.conferences),
                    result.unreliable,
                    result.elapsed_ms,
                )
            else:
                logger.error(
                    "Conference provider %s failed error=%s elapsed_ms=%.0f",
                    result.provider,
                    result.error,
                    result.elapsed_ms,
                )
        logger.info(
            "Conference aggregation fetched=%s deduped=%s dupes=%s "
            "verified=%s verify_failed=%s failures=%s elapsed_ms=%.0f",
            stats.fetched,
            stats.after_dedupe,
            stats.duplicates_skipped,
            stats.verified,
            stats.verify_failed,
            len(stats.failures),
            stats.elapsed_ms,
        )


def overlay_official_facts(conference: Conference, facts: dict[str, Any]) -> Conference:
    """Official page values replace community values when present."""
    updated = conference.model_copy(deep=True)
    if facts.get("location"):
        updated.location = facts["location"]
        city, state, country = parse_location_parts(facts["location"])
        updated.city = facts.get("city") or city
        updated.state = facts.get("state") or state
        updated.country = facts.get("country") or country
        status = facts.get("location_status") or classify_conference_location(
            updated.location
        )
        updated.location_status = (
            status if isinstance(status, LocationStatus) else LocationStatus(status)
        )
        updated.is_virtual = updated.location_status == LocationStatus.VIRTUAL
    if facts.get("start_date"):
        updated.start_date = facts["start_date"]
        updated.end_date = facts.get("end_date") or facts["start_date"]
    if facts.get("official_url"):
        updated.official_url = facts["official_url"]
    if facts.get("last_verified_at"):
        updated.last_verified_at = facts["last_verified_at"]
    return updated
