"""SQLAlchemy models for conferences, funding, and typed deadlines."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from typing import Any, Optional

from database.models import Base
from model.conference import Conference
from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship


class ConferenceModel(Base):
    __tablename__ = "conferences"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String)
    organization: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    official_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    source: Mapped[str] = mapped_column(String)
    source_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    state: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    is_virtual: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )
    location_status: Mapped[str] = mapped_column(String, default="UNKNOWN")
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    call_for_papers_deadline: Mapped[Optional[date]] = mapped_column(
        Date, nullable=True
    )
    paper_submission_deadline: Mapped[Optional[date]] = mapped_column(
        Date, nullable=True
    )
    abstract_deadline: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    registration_deadline: Mapped[Optional[date]] = mapped_column(
        Date, nullable=True
    )
    student_registration_deadline: Mapped[Optional[date]] = mapped_column(
        Date, nullable=True
    )
    funding_deadline: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    application_deadline: Mapped[Optional[date]] = mapped_column(
        Date, nullable=True
    )
    conference_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    topics: Mapped[list[Any]] = mapped_column(JSONB, default=list)
    student_eligible: Mapped[Optional[bool]] = mapped_column(
        Boolean, nullable=True, default=None
    )
    undergraduate_eligible: Mapped[Optional[bool]] = mapped_column(
        Boolean, nullable=True, default=None
    )
    graduate_eligible: Mapped[Optional[bool]] = mapped_column(
        Boolean, nullable=True, default=None
    )
    funding_available: Mapped[Optional[bool]] = mapped_column(
        Boolean, nullable=True, default=None
    )
    travel_grant_available: Mapped[Optional[bool]] = mapped_column(
        Boolean, nullable=True, default=None
    )
    registration_waiver_available: Mapped[Optional[bool]] = mapped_column(
        Boolean, nullable=True, default=None
    )
    scholarship_available: Mapped[Optional[bool]] = mapped_column(
        Boolean, nullable=True, default=None
    )
    funding_amount: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    funding_requirements: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )
    citizenship_requirements: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )
    residency_requirements: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )
    eligibility_requirements: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )
    application_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    fingerprint: Mapped[str] = mapped_column(String, unique=True)
    sources: Mapped[list[Any]] = mapped_column(JSONB, default=list)
    status: Mapped[str] = mapped_column(String, default="unknown")
    last_verified_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    eligibility_status: Mapped[str] = mapped_column(
        String, default="NEEDS_VERIFICATION"
    )
    funding_status: Mapped[str] = mapped_column(String, default="FUNDING_UNKNOWN")
    citizenship_status: Mapped[str] = mapped_column(String, default="ELIGIBLE")
    funding_eligibility_status: Mapped[str] = mapped_column(
        String, default="NEEDS_VERIFICATION"
    )
    match_score: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    match_reasons: Mapped[list[Any]] = mapped_column(JSONB, default=list)
    saved: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )
    saved_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    tracking_status: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    tracking_updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    funding_rows: Mapped[list["ConferenceFundingModel"]] = relationship(
        back_populates="conference",
        cascade="all, delete-orphan",
    )
    deadline_rows: Mapped[list["ConferenceDeadlineModel"]] = relationship(
        back_populates="conference",
        cascade="all, delete-orphan",
    )

    @classmethod
    def from_conference(cls, conference: Conference) -> "ConferenceModel":
        return cls(
            id=uuid.uuid4(),
            name=conference.name,
            organization=conference.organization,
            description=conference.description,
            official_url=conference.official_url,
            source=conference.source,
            source_url=conference.source_url,
            location=conference.location,
            country=conference.country,
            city=conference.city,
            state=conference.state,
            is_virtual=conference.is_virtual,
            location_status=conference.location_status.value,
            start_date=conference.start_date,
            end_date=conference.end_date,
            call_for_papers_deadline=conference.call_for_papers_deadline,
            paper_submission_deadline=conference.paper_submission_deadline,
            abstract_deadline=conference.abstract_deadline,
            registration_deadline=conference.registration_deadline,
            student_registration_deadline=conference.student_registration_deadline,
            funding_deadline=conference.funding_deadline,
            application_deadline=conference.application_deadline,
            conference_type=conference.conference_type,
            topics=list(conference.topics),
            student_eligible=conference.student_eligible,
            undergraduate_eligible=conference.undergraduate_eligible,
            graduate_eligible=conference.graduate_eligible,
            funding_available=conference.funding_available,
            travel_grant_available=conference.travel_grant_available,
            registration_waiver_available=conference.registration_waiver_available,
            scholarship_available=conference.scholarship_available,
            funding_amount=conference.funding_amount,
            funding_requirements=conference.funding_requirements,
            citizenship_requirements=conference.citizenship_requirements,
            residency_requirements=conference.residency_requirements,
            eligibility_requirements=conference.eligibility_requirements,
            application_url=conference.application_url,
            fingerprint=conference.fingerprint,
            sources=[s.model_dump() for s in conference.sources],
            status=conference.status,
            last_verified_at=conference.last_verified_at,
            eligibility_status=conference.eligibility_status.value,
            funding_status=conference.funding_status.value,
            citizenship_status=conference.citizenship_status.value,
            funding_eligibility_status=conference.funding_eligibility_status.value,
            match_score=conference.match_score,
            match_reasons=[r.model_dump() for r in conference.match_reasons],
        )


class ConferenceFundingModel(Base):
    __tablename__ = "conference_funding"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conferences.id", ondelete="CASCADE"),
        index=True,
    )
    name: Mapped[str] = mapped_column(String)
    kind: Mapped[str] = mapped_column(String, default="other")
    amount: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    deadline: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    application_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    requirements_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    undergraduate_eligible: Mapped[Optional[bool]] = mapped_column(
        Boolean, nullable=True
    )
    paper_required: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    citizenship_requirements: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )
    eligibility_status: Mapped[str] = mapped_column(
        String, default="NEEDS_VERIFICATION"
    )
    source_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    conference: Mapped[ConferenceModel] = relationship(
        back_populates="funding_rows"
    )


class ConferenceDeadlineModel(Base):
    __tablename__ = "conference_deadlines"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conferences.id", ondelete="CASCADE"),
        index=True,
    )
    kind: Mapped[str] = mapped_column(String)
    deadline_at: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    is_rolling: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )
    is_unknown: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )
    source_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    conference: Mapped[ConferenceModel] = relationship(
        back_populates="deadline_rows"
    )
