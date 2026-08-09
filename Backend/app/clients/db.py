import os

from database import jobmodel  # noqa: F401 — register JobModel with Base
from database import resumemodel  # noqa: F401 — register Resume* models
from database.models import Base
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def drop_database():
    Base.metadata.drop_all(bind=engine)


def ensure_schema():
    """Apply lightweight column migrations create_all cannot handle."""
    with engine.begin() as conn:
        conn.execute(
            text(
                "ALTER TABLE jobs "
                "ADD COLUMN IF NOT EXISTS applied BOOLEAN NOT NULL DEFAULT false"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE jobs "
                "ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ"
            )
        )
        # Best-effort backfill for rows marked applied before applied_at existed.
        conn.execute(
            text(
                """
                UPDATE jobs
                SET applied_at = updated_at
                WHERE applied = true AND applied_at IS NULL
                """
            )
        )
        conn.execute(
            text(
                "ALTER TABLE jobs "
                "ADD COLUMN IF NOT EXISTS saved BOOLEAN NOT NULL DEFAULT false"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE jobs "
                "ADD COLUMN IF NOT EXISTS saved_at TIMESTAMPTZ"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE jobs "
                "ADD COLUMN IF NOT EXISTS flagged BOOLEAN NOT NULL DEFAULT false"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE jobs "
                "ADD COLUMN IF NOT EXISTS flagged_at TIMESTAMPTZ"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE jobs "
                "ADD COLUMN IF NOT EXISTS sponsorship_available BOOLEAN"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE jobs "
                "ADD COLUMN IF NOT EXISTS sponsorship_match VARCHAR"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE jobs "
                "ADD COLUMN IF NOT EXISTS sponsorship_confidence "
                "DOUBLE PRECISION NOT NULL DEFAULT 0"
            )
        )
        conn.execute(
            text("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS ats VARCHAR")
        )
        conn.execute(
            text("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS external_id VARCHAR")
        )
        conn.execute(
            text("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS role_family VARCHAR")
        )
        conn.execute(
            text(
                "ALTER TABLE jobs "
                "ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true"
            )
        )
        conn.execute(
            text("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS description TEXT")
        )
        conn.execute(
            text(
                "ALTER TABLE jobs "
                "ADD COLUMN IF NOT EXISTS min_years_required DOUBLE PRECISION"
            )
        )

        # One saved match per resume+job (overwrite on re-analysis).
        # Dedupe any legacy rows keyed by description_hash first.
        conn.execute(
            text(
                """
                DELETE FROM resume_analyses a
                USING resume_analyses b
                WHERE a.resume_id = b.resume_id
                  AND a.job_id = b.job_id
                  AND (
                    a.created_at < b.created_at
                    OR (
                      a.created_at = b.created_at
                      AND a.id::text < b.id::text
                    )
                  )
                """
            )
        )
        conn.execute(
            text(
                "ALTER TABLE resume_analyses "
                "DROP CONSTRAINT IF EXISTS uq_resume_job_description_hash"
            )
        )
        conn.execute(
            text(
                """
                DO $$
                BEGIN
                  IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'uq_resume_job'
                  ) THEN
                    ALTER TABLE resume_analyses
                      ADD CONSTRAINT uq_resume_job UNIQUE (resume_id, job_id);
                  END IF;
                END $$;
                """
            )
        )


def create_database():
    Base.metadata.create_all(bind=engine)
    ensure_schema()
