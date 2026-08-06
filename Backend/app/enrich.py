"""Enrich stored jobs: fetch descriptions → detect sponsorship → persist."""

from __future__ import annotations

import argparse
import asyncio
import logging
import uuid

from clients.db import SessionLocal, create_database
from database.jobmodel import JobModel
from fetchers.exceptions import FetchError
from fetchers.router import FetcherRouter
from sqlalchemy.orm import Session
from sponsorship.service import SponsorshipService

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)


async def enrich_job(
    db: Session,
    job: JobModel,
    *,
    service: SponsorshipService,
    router: FetcherRouter,
) -> bool:
    """Fetch description for one job and store sponsorship fields.

    Returns True on success, False when the description could not be fetched.
    """
    try:
        await service.enrich_from_url(db, job, router=router)
        return True
    except FetchError:
        logger.warning(
            "Sponsorship enrich skipped: fetch failed job=%s url=%s",
            job.id,
            job.apply_url,
        )
        return False
    except Exception:  # noqa: BLE001
        logger.exception(
            "Sponsorship enrich failed job=%s url=%s",
            job.id,
            job.apply_url,
        )
        return False


async def enrich_pending_jobs(
    db: Session,
    *,
    limit: int | None = None,
    force: bool = False,
    job_ids: list[uuid.UUID] | None = None,
) -> dict[str, int]:
    """Run description fetch + sponsorship detection for jobs in the database.

    By default only jobs that have never been analyzed
    (``sponsorship_confidence == 0`` and ``sponsorship_available is None``)
    are processed. Pass ``force=True`` to re-analyze all matching rows.
    """
    query = db.query(JobModel)
    if job_ids:
        query = query.filter(JobModel.id.in_(job_ids))
    elif not force:
        query = query.filter(
            JobModel.sponsorship_available.is_(None),
            JobModel.sponsorship_confidence == 0.0,
        )

    query = query.order_by(JobModel.created_at.desc())
    if limit is not None:
        query = query.limit(limit)

    jobs = query.all()
    logger.info("Sponsorship enrich: candidates=%s force=%s", len(jobs), force)

    service = SponsorshipService()
    router = FetcherRouter()
    ok = 0
    failed = 0

    for job in jobs:
        success = await enrich_job(db, job, service=service, router=router)
        if success:
            ok += 1
        else:
            failed += 1

    logger.info("Sponsorship enrich complete: ok=%s failed=%s", ok, failed)
    return {"ok": ok, "failed": failed, "total": len(jobs)}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fetch job descriptions and detect visa sponsorship signals."
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Max number of jobs to enrich (default: all pending).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-analyze jobs that already have sponsorship results.",
    )
    args = parser.parse_args()

    create_database()
    db = SessionLocal()
    try:
        asyncio.run(
            enrich_pending_jobs(db, limit=args.limit, force=args.force)
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
