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
from sponsorship.service import SponsorshipService
from sqlalchemy.orm import Session

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)


def rescan_citizenship_from_stored_descriptions(db: Session) -> int:
    """Flag citizenship on jobs whose stored JD already requires it.

    Avoids re-fetching ATS pages for rows enriched before citizenship detection.
    Returns the number of jobs newly flagged.
    """
    from sponsorship.detector import detect_citizenship_required

    service = SponsorshipService()
    jobs = (
        db.query(JobModel)
        .filter(
            JobModel.description.isnot(None),
            JobModel.citizenship_required.is_(False),
        )
        .all()
    )
    flagged = 0
    for job in jobs:
        description = (job.description or "").strip()
        if not description:
            continue
        if detect_citizenship_required(description) is None:
            continue
        result = service.analyze(description)
        service.apply_result(job, result, description=description)
        flagged += 1

    if flagged:
        db.commit()
    return flagged


def rescan_experience_from_stored_descriptions(db: Session) -> int:
    """Parse min years from stored JDs that have not been scanned yet.

    Returns the number of jobs newly stamped with ``min_years_required``.
    """
    from processors.experience import extract_min_years_required

    service = SponsorshipService()
    jobs = (
        db.query(JobModel)
        .filter(
            JobModel.description.isnot(None),
            JobModel.min_years_required.is_(None),
        )
        .all()
    )
    stamped = 0
    for job in jobs:
        description = (job.description or "").strip()
        if not description:
            continue
        years = extract_min_years_required(description)
        if years is None:
            continue
        result = service.analyze(description)
        service.apply_result(job, result, description=description)
        stamped += 1

    if stamped:
        db.commit()
    return stamped


def rewrite_broken_apply_urls(db: Session) -> int:
    """Fix stored Stripe search deep-links in place (fingerprint unchanged)."""
    from processors.apply_url import rewrite_apply_url
    from sqlalchemy import or_

    rows = (
        db.query(JobModel)
        .filter(
            or_(
                JobModel.apply_url.ilike("%stripe.com/jobs/search?gh_jid=%"),
                JobModel.apply_url.ilike("%stripe.com/careers/search?gh_jid=%"),
                JobModel.apply_url.ilike("%stripe.com/jobs/search?%gh_jid=%"),
                JobModel.apply_url.ilike("%stripe.com/careers/search?%gh_jid=%"),
            )
        )
        .all()
    )
    updated = 0
    for job in rows:
        rewritten = rewrite_apply_url(
            job.apply_url,
            role=job.role,
            external_id=job.external_id,
        )
        if rewritten != job.apply_url:
            job.apply_url = rewritten
            updated += 1
    if updated:
        db.commit()
    return updated


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
    backfilled = rescan_citizenship_from_stored_descriptions(db)
    if backfilled:
        logger.info(
            "Citizenship backfill from stored descriptions: flagged=%s",
            backfilled,
        )
    experience_stamped = rescan_experience_from_stored_descriptions(db)
    if experience_stamped:
        logger.info(
            "Experience backfill from stored descriptions: stamped=%s",
            experience_stamped,
        )

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
        asyncio.run(enrich_pending_jobs(db, limit=args.limit, force=args.force))
    finally:
        db.close()


if __name__ == "__main__":
    main()
