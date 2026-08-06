import uuid
from datetime import datetime, timezone
from typing import Optional

from database.models import Base
from model.job import Job
from sqlalchemy import Boolean, DateTime, Float, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column


class JobModel(Base):
    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company: Mapped[str] = mapped_column(String)
    role: Mapped[str] = mapped_column(String)
    location: Mapped[str] = mapped_column(String)
    apply_url: Mapped[str] = mapped_column(String)
    age: Mapped[str] = mapped_column(String)
    fingerprint: Mapped[str] = mapped_column(String, unique=True)
    source: Mapped[str] = mapped_column(String)
    faang: Mapped[bool] = mapped_column(Boolean)
    no_sponsorship: Mapped[bool] = mapped_column(Boolean)
    citizenship_required: Mapped[bool] = mapped_column(Boolean)
    advanced_degree: Mapped[bool] = mapped_column(Boolean)
    closed: Mapped[bool] = mapped_column(Boolean)
    applied: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    ats: Mapped[Optional[str]] = mapped_column(String, nullable=True, default=None)
    external_id: Mapped[Optional[str]] = mapped_column(String, nullable=True, default=None)
    role_family: Mapped[Optional[str]] = mapped_column(String, nullable=True, default=None)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default=None)
    sponsorship_available: Mapped[Optional[bool]] = mapped_column(
        Boolean, nullable=True, default=None
    )
    sponsorship_match: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    sponsorship_confidence: Mapped[float] = mapped_column(
        Float, default=0.0, server_default="0"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    @classmethod
    def from_job(cls, job: Job) -> "JobModel":

        return cls(
            id=uuid.uuid4(),
            company=job.company,
            role=job.role,
            location=job.location,
            apply_url=job.apply_url,
            age=job.age,
            fingerprint=job.fingerprint,
            source=job.source,
            faang=job.faang,
            no_sponsorship=job.no_sponsorship,
            citizenship_required=job.citizenship_required,
            advanced_degree=job.advanced_degree,
            closed=job.closed,
            ats=job.ats,
            external_id=job.external_id,
            role_family=job.role_family,
            is_active=job.is_active,
            description=job.description,
            sponsorship_available=job.sponsorship_available,
            sponsorship_match=job.sponsorship_match,
            sponsorship_confidence=job.sponsorship_confidence,
        )
