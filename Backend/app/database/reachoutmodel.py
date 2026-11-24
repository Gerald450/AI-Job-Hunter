"""ORM model for LinkedIn outreach contacts."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from database.models import Base
from sqlalchemy import Boolean, CheckConstraint, DateTime, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column


class LinkedInContact(Base):
    __tablename__ = "linkedin_contacts"
    __table_args__ = (
        UniqueConstraint(
            "name",
            "company",
            name="uq_linkedin_contact_name_company",
        ),
        CheckConstraint(
            "importance >= 0 AND importance <= 100",
            name="ck_linkedin_contact_importance",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    company: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(Text, nullable=False, default="")
    why: Mapped[str] = mapped_column(Text, nullable=False, default="")
    importance: Mapped[int] = mapped_column(Integer, nullable=False)
    reached_out: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    responded: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    followed_up: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    followed_up_manual: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class LinkedInContactDeletion(Base):
    """People removed from the tracker. The seed will not insert them again."""

    __tablename__ = "linkedin_contact_deletions"
    __table_args__ = (
        UniqueConstraint(
            "name",
            "company",
            name="uq_linkedin_contact_deletion_name_company",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    company: Mapped[str] = mapped_column(String, nullable=False)
    deleted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
