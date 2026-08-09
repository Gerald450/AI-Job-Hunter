"""ORM models for resumes and on-demand resume analyses."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from database.models import Base
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column


class ResumeModel(Base):
    __tablename__ = "resumes"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    filename: Mapped[str] = mapped_column(String)
    content_type: Mapped[str] = mapped_column(String)
    size: Mapped[int] = mapped_column(Integer)
    parsed: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    content_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class ResumeAnalysisModel(Base):
    __tablename__ = "resume_analyses"
    __table_args__ = (
        UniqueConstraint(
            "resume_id",
            "job_id",
            name="uq_resume_job",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), index=True
    )
    resume_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("resumes.id", ondelete="CASCADE"), index=True
    )
    overall_match: Mapped[int] = mapped_column(Integer)
    summary: Mapped[str] = mapped_column(Text, default="")
    strengths: Mapped[list[Any]] = mapped_column(JSONB, default=list)
    missing_skills: Mapped[list[Any]] = mapped_column(JSONB, default=list)
    recommendations: Mapped[list[Any]] = mapped_column(JSONB, default=list)
    matched_keywords: Mapped[list[Any]] = mapped_column(JSONB, default=list)
    missing_keywords: Mapped[list[Any]] = mapped_column(JSONB, default=list)
    confidence: Mapped[str] = mapped_column(String(16), default="Medium")
    llm_provider: Mapped[str] = mapped_column(String(32), default="groq")
    description_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
