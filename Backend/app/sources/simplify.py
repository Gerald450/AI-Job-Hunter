"""SimplifyJobs GitHub README as a ``ListSource``."""

from __future__ import annotations

import asyncio
import logging

from fetchers.simplify import SimplifyFetcher
from model.job import Job

logger = logging.getLogger(__name__)


class SimplifyListSource:
    """Discover jobs from SimplifyJobs New-Grad-Positions."""

    name = "simplify"

    def __init__(self, *, fetcher: SimplifyFetcher | None = None) -> None:
        self._fetcher = fetcher or SimplifyFetcher()

    async def fetch_jobs(self) -> list[Job]:
        jobs = await asyncio.to_thread(self._fetcher.fetch)
        for job in jobs:
            job.source = self.name
        logger.info("Simplify: fetched %s jobs", len(jobs))
        return jobs
