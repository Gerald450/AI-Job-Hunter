"""Aggregate job listings from all configured list sources into PostgreSQL."""

from __future__ import annotations

import argparse
import asyncio
import logging

from clients.db import SessionLocal, create_database
from database.crud import delete_stale_jobs, insert_jobs
from database.jobmodel import JobModel
from enrich import enrich_pending_jobs
from processors.age import load_max_age_days
from sources.aggregation import JobAggregationService

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)


def main() -> None:
    parser = argparse.ArgumentParser(description="Aggregate US early-career jobs.")
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

    logger.info("Creating database (if needed)...")
    create_database()

    db = SessionLocal()
    try:
        max_age_days = load_max_age_days()
        removed = delete_stale_jobs(db, max_age_days=max_age_days)
        logger.info(
            "Dropped %s jobs older than %s days",
            removed,
            max_age_days,
        )

        service = JobAggregationService(max_age_days=max_age_days)
        normalized, stats = asyncio.run(service.aggregate())
        logger.info(
            "Aggregation kept %s jobs (fetched=%s dupes=%s stale=%s failures=%s)",
            len(normalized),
            stats.fetched,
            stats.duplicates_skipped,
            stats.stale_skipped,
            len(stats.failures),
        )

        logger.info("Upserting %s jobs...", len(normalized))
        result = insert_jobs(db, normalized)
        count = db.query(JobModel).count()
        logger.info(
            "Upsert submitted=%s database size=%s",
            result.get("submitted"),
            count,
        )

        if args.enrich:
            logger.info("Running sponsorship enrichment...")
            asyncio.run(
                enrich_pending_jobs(db, limit=args.enrich_limit, force=False)
            )
    finally:
        db.close()


if __name__ == "__main__":
    main()
