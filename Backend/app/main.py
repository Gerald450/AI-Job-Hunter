"""Aggregate job listings from all configured list sources into PostgreSQL."""

from __future__ import annotations

import argparse
import asyncio
import logging

from clients.db import SessionLocal, create_database
from clients.pittcsc import fetch_readme as fetch_pittcsc_readme
from database.crud import insert_jobs
from database.jobmodel import JobModel
from enrich import enrich_pending_jobs
from fetchers.simplify import SimplifyFetcher
from model.job import Job
from processors.location import is_us_location
from processors.normalize import normalize_job
from processors.pittParser import parse_jobs

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)


def fetch_pittcsc_jobs() -> list[Job]:
    content = fetch_pittcsc_readme()
    raw = parse_jobs(content, source="pittcsc")
    jobs: list[Job] = []
    for item in raw:
        try:
            jobs.append(normalize_job(item))
        except Exception:  # noqa: BLE001
            logger.exception("Failed to normalize PittCSC job: %s", item.get("role"))
    logger.info("PittCSC: normalized %s jobs", len(jobs))
    return jobs


def filter_us_jobs(jobs: list[Job]) -> list[Job]:
    """Keep only roles with a US (or US-remote) location."""
    kept: list[Job] = []
    dropped = 0
    for job in jobs:
        if is_us_location(job.location):
            kept.append(job)
        else:
            dropped += 1
            logger.debug(
                "Dropping non-US job company=%s role=%s location=%s",
                job.company,
                job.role,
                job.location,
            )
    logger.info(
        "US location filter: kept=%s dropped=%s (of %s)",
        len(kept),
        dropped,
        len(jobs),
    )
    return kept


def aggregate_jobs() -> list[Job]:
    """Pull every list source and return a combined (not yet deduped) job list.

    Fingerprint-based upsert in ``insert_jobs`` removes cross-source duplicates.
    Non-US locations are dropped before return.
    """
    combined: list[Job] = []

    try:
        pittcsc = fetch_pittcsc_jobs()
        combined.extend(pittcsc)
    except Exception:  # noqa: BLE001
        logger.exception("PittCSC source failed")

    try:
        simplify = SimplifyFetcher().fetch()
        combined.extend(simplify)
    except Exception:  # noqa: BLE001
        logger.exception("SimplifyJobs source failed")

    logger.info("Aggregation complete: %s jobs before US filter", len(combined))
    return filter_us_jobs(combined)


def main() -> None:
    parser = argparse.ArgumentParser(description="Aggregate US new-grad jobs.")
    parser.add_argument(
        "--enrich",
        action="store_true",
        help=(
            "After upsert, fetch job descriptions and run the Sponsorship "
            "Detection Engine on jobs that have not been analyzed yet."
        ),
    )
    parser.add_argument(
        "--enrich-limit",
        type=int,
        default=None,
        help="Max jobs to enrich when --enrich is set (default: all pending).",
    )
    args = parser.parse_args()

    normalized = aggregate_jobs()
    logger.info("Creating database (if needed)...")
    create_database()

    db = SessionLocal()
    try:
        logger.info("Upserting %s US jobs...", len(normalized))
        insert_jobs(db, normalized)
        count = db.query(JobModel).count()
        logger.info("Database current size: %s", count)

        if args.enrich:
            logger.info("Running sponsorship enrichment...")
            asyncio.run(
                enrich_pending_jobs(db, limit=args.enrich_limit, force=False)
            )
    finally:
        db.close()


if __name__ == "__main__":
    main()
