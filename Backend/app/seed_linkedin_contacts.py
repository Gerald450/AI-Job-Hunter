"""Idempotent seed of LinkedIn outreach contacts.

Run from Backend/app:

    python seed_linkedin_contacts.py

Upserts on name + company. Outreach flags and notes are left untouched, so
running this again does not duplicate rows or wipe tracker state.
"""

from __future__ import annotations

import logging
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
load_dotenv(Path(__file__).resolve().parent / ".env")

from clients.db import SessionLocal, create_database  # noqa: E402
from database.reachout_crud import seed_linkedin_contacts  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)


def main() -> None:
    create_database()
    db = SessionLocal()
    try:
        count = seed_linkedin_contacts(db)
        logger.info("Seeded LinkedIn contacts: %s", count)
    finally:
        db.close()


if __name__ == "__main__":
    main()
