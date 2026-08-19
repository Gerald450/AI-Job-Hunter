"""Aggregate conferences from configured sources into PostgreSQL."""

from __future__ import annotations

import argparse
import asyncio
import logging

from clients.db import SessionLocal, create_database
from database.conference_crud import (
    delete_virtual_and_unfunded_conferences,
    insert_conferences,
)
from database.conferencemodel import ConferenceModel
from sources.conferences.aggregation import ConferenceAggregationService

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)


def main() -> None:
    parser = argparse.ArgumentParser(description="Aggregate CS/AI conferences.")
    parser.add_argument(
        "--verify",
        action="store_true",
        help="Fetch official pages and extract student funding (rate-limited).",
    )
    parser.add_argument(
        "--verify-limit",
        type=int,
        default=None,
        help="Max conferences to verify when --verify is set.",
    )
    parser.add_argument(
        "--source",
        type=str,
        default=None,
        help="Run a single provider (e.g. usenix, developers_events).",
    )
    args = parser.parse_args()

    logger.info("Creating database (if needed)...")
    create_database()

    from sources.conferences.registry import build_conference_sources

    sources = None
    if args.source:
        sources = [
            src
            for src in build_conference_sources()
            if src.name == args.source.strip().lower()
        ]
        if not sources:
            raise SystemExit(f"Unknown conference source: {args.source}")

    db = SessionLocal()
    try:
        service = ConferenceAggregationService(sources=sources)
        conferences, stats = asyncio.run(
            service.aggregate(verify=args.verify, verify_limit=args.verify_limit)
        )
        logger.info(
            "Aggregation kept %s conferences (fetched=%s dupes=%s failures=%s)",
            len(conferences),
            stats.fetched,
            stats.duplicates_skipped,
            len(stats.failures),
        )
        result = insert_conferences(db, conferences)
        removed = delete_virtual_and_unfunded_conferences(db)
        count = db.query(ConferenceModel).count()
        logger.info(
            "Upsert submitted=%s deleted_stale=%s database size=%s",
            result.get("submitted"),
            removed,
            count,
        )
        unreliable = [p.provider for p in stats.providers if p.unreliable]
        if unreliable:
            logger.warning("Unreliable sources (JS or empty listing): %s", unreliable)
    finally:
        db.close()


if __name__ == "__main__":
    main()
