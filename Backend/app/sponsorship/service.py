"""Persist sponsorship detection results after a job description is fetched."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from database.jobmodel import JobModel
from fetchers.base import JobDescription
from fetchers.router import FetcherRouter
from sqlalchemy.orm import Session
from sponsorship.detector import SponsorshipDetector
from sponsorship.models import SponsorshipResult

logger = logging.getLogger(__name__)


class SponsorshipService:
    """Run detection on a description and store fields on the job row."""

    def __init__(self, detector: SponsorshipDetector | None = None) -> None:
        self._detector = detector or SponsorshipDetector()

    def analyze(self, description: str) -> SponsorshipResult:
        """Detect sponsorship signals in ``description`` (no I/O)."""
        return self._detector.detect(description)

    def apply_result(
        self,
        job: JobModel,
        result: SponsorshipResult,
        *,
        job_id: str | uuid.UUID | None = None,
    ) -> JobModel:
        """Write detection fields onto ``job`` and sync ``no_sponsorship``."""
        job.sponsorship_available = result.sponsorship
        job.sponsorship_match = result.matched_phrase
        job.sponsorship_confidence = result.confidence
        job.updated_at = datetime.now(timezone.utc)

        if result.sponsorship is False:
            job.no_sponsorship = True
        elif result.sponsorship is True:
            job.no_sponsorship = False

        log_id = job_id if job_id is not None else job.id
        matched = (
            f'"{result.matched_phrase}"' if result.matched_phrase is not None else None
        )
        logger.info(
            "Job %s sponsorship=%s matched=%s",
            log_id,
            result.sponsorship,
            matched,
        )
        return job

    def detect_and_store(
        self,
        db: Session,
        job: JobModel,
        description: str,
    ) -> SponsorshipResult:
        """Analyze ``description``, persist fields (and description), and commit."""
        result = self.analyze(description)
        self.apply_result(job, result)
        if description and description.strip():
            job.description = description
        db.commit()
        db.refresh(job)
        return result

    async def enrich_from_url(
        self,
        db: Session,
        job: JobModel,
        *,
        router: FetcherRouter | None = None,
    ) -> SponsorshipResult:
        """Fetch the job description, detect sponsorship, and store the result."""
        fetcher_router = router or FetcherRouter()
        fetched: JobDescription = await fetcher_router.fetch(job.apply_url)
        return self.detect_and_store(db, job, fetched.description)
