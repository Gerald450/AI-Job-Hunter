"""Parallel multi-provider job aggregation service."""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field

from model.job import Job
from processors.age import is_within_max_age, load_max_age_days
from processors.classify import classify_role_family
from processors.early_career import is_early_career
from processors.location import is_us_location
from sources.base import ListSource, ProviderResult
from sources.registry import build_list_sources

logger = logging.getLogger(__name__)


@dataclass
class AggregationStats:
    """Summary metrics for one aggregation run."""

    providers: list[ProviderResult] = field(default_factory=list)
    fetched: int = 0
    after_filters: int = 0
    duplicates_skipped: int = 0
    stale_skipped: int = 0
    elapsed_ms: float = 0.0

    @property
    def failures(self) -> list[ProviderResult]:
        return [p for p in self.providers if not p.ok]


class JobAggregationService:
    """Fetch all list sources concurrently, filter, classify, and dedupe."""

    def __init__(
        self,
        sources: list[ListSource] | None = None,
        *,
        require_us: bool = True,
        require_role_family: bool = True,
        require_early_career: bool = True,
        max_age_days: int | None = None,
    ) -> None:
        self._sources = sources if sources is not None else build_list_sources()
        self._require_us = require_us
        self._require_role_family = require_role_family
        self._require_early_career = require_early_career
        self._max_age_days = (
            load_max_age_days() if max_age_days is None else max_age_days
        )

    async def aggregate(self) -> tuple[list[Job], AggregationStats]:
        started = time.perf_counter()
        results = await asyncio.gather(
            *[self._run_provider(source) for source in self._sources],
        )
        provider_results = list(results)

        combined: list[Job] = []
        for result in provider_results:
            combined.extend(result.jobs)

        filtered: list[Job] = []
        stale_skipped = 0
        for job in combined:
            if not is_within_max_age(age=job.age, max_age_days=self._max_age_days):
                stale_skipped += 1
                continue
            if self._require_us and not is_us_location(job.location):
                continue
            if self._require_early_career and not is_early_career(job.role):
                continue
            if not job.role_family:
                job.role_family = classify_role_family(job.role)
            if self._require_role_family and not job.role_family:
                continue
            filtered.append(job)

        deduped, dupes = self._dedupe(filtered)
        stats = AggregationStats(
            providers=provider_results,
            fetched=len(combined),
            after_filters=len(filtered),
            duplicates_skipped=dupes,
            stale_skipped=stale_skipped,
            elapsed_ms=(time.perf_counter() - started) * 1000,
        )
        self._log_stats(stats, kept=len(deduped))
        return deduped, stats

    async def _run_provider(self, source: ListSource) -> ProviderResult:
        started = time.perf_counter()
        try:
            jobs = await source.fetch_jobs()
            return ProviderResult(
                provider=source.name,
                jobs=jobs,
                elapsed_ms=(time.perf_counter() - started) * 1000,
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("Provider failed: %s", source.name)
            return ProviderResult(
                provider=source.name,
                jobs=[],
                error=str(exc),
                elapsed_ms=(time.perf_counter() - started) * 1000,
            )

    @staticmethod
    def _dedupe(jobs: list[Job]) -> tuple[list[Job], int]:
        """Prefer external_id+ats when present; else fingerprint."""
        seen: set[str] = set()
        unique: list[Job] = []
        dupes = 0
        for job in jobs:
            if job.ats and job.external_id:
                key = f"ext:{job.ats}:{job.external_id}"
            else:
                key = f"fp:{job.fingerprint}"
            if key in seen:
                dupes += 1
                continue
            seen.add(key)
            unique.append(job)
        return unique, dupes

    @staticmethod
    def _log_stats(stats: AggregationStats, *, kept: int) -> None:
        for result in stats.providers:
            if result.ok:
                logger.info(
                    "Provider %s ok jobs=%s elapsed_ms=%.0f",
                    result.provider,
                    len(result.jobs),
                    result.elapsed_ms,
                )
            else:
                logger.error(
                    "Provider %s failed error=%s elapsed_ms=%.0f",
                    result.provider,
                    result.error,
                    result.elapsed_ms,
                )
        logger.info(
            "Aggregation complete fetched=%s after_filters=%s "
            "deduped=%s duplicates_skipped=%s stale_skipped=%s "
            "failures=%s elapsed_ms=%.0f",
            stats.fetched,
            stats.after_filters,
            kept,
            stats.duplicates_skipped,
            stats.stale_skipped,
            len(stats.failures),
            stats.elapsed_ms,
        )
