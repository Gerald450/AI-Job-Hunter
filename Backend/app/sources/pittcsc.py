"""PittCSC GitHub README as a ``ListSource``."""

from __future__ import annotations

import asyncio
import logging

from clients.pittcsc import fetch_readme
from model.job import Job
from processors.normalize import normalize_job
from processors.pittParser import parse_jobs

logger = logging.getLogger(__name__)


class PittcscListSource:
    """Discover jobs from the PittCSC Summer Internships README."""

    name = "pittcsc"

    def __init__(self, *, readme_fetcher=fetch_readme) -> None:
        self._readme_fetcher = readme_fetcher

    async def fetch_jobs(self) -> list[Job]:
        content = await asyncio.to_thread(self._readme_fetcher)
        raw = parse_jobs(content, source=self.name)
        jobs: list[Job] = []
        for item in raw:
            try:
                job = normalize_job(item)
                job.ats = job.ats or None
                job.source = self.name
                jobs.append(job)
            except Exception:  # noqa: BLE001
                logger.exception(
                    "PittCSC: failed to normalize job role=%s",
                    item.get("role"),
                )
        logger.info("PittCSC: normalized %s jobs", len(jobs))
        return jobs
