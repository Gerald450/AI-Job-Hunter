import os

from database import jobmodel
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


def create_database():
    Base.metadata.create_all(bind=engine)
    ensure_schema()
