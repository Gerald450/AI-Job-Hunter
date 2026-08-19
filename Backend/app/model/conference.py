"""Domain models and enums for the conference aggregation pipeline."""

from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class LocationStatus(str, Enum):
    US = "US"
    VIRTUAL = "VIRTUAL"
    NON_US = "NON_US"
    UNKNOWN = "UNKNOWN"


class EligibilityStatus(str, Enum):
    ELIGIBLE = "ELIGIBLE"
    LIKELY_ELIGIBLE = "LIKELY_ELIGIBLE"
    NEEDS_VERIFICATION = "NEEDS_VERIFICATION"
    NOT_ELIGIBLE = "NOT_ELIGIBLE"


class FundingStatus(str, Enum):
    FUNDING_AVAILABLE = "FUNDING_AVAILABLE"
    NO_FUNDING_FOUND = "NO_FUNDING_FOUND"
    FUNDING_UNKNOWN = "FUNDING_UNKNOWN"


class DeadlineKind(str, Enum):
    CFP = "cfp"
    PAPER = "paper"
    ABSTRACT = "abstract"
    REGISTRATION = "registration"
    STUDENT_REGISTRATION = "student_registration"
    TRAVEL_GRANT = "travel_grant"
    SCHOLARSHIP = "scholarship"
    APPLICATION = "application"
    ROLLING = "rolling"


class FundingKind(str, Enum):
    TRAVEL_GRANT = "travel_grant"
    REGISTRATION_WAIVER = "registration_waiver"
    SCHOLARSHIP = "scholarship"
    ATTENDANCE_GRANT = "attendance_grant"
    HOTEL = "hotel"
    AIRFARE = "airfare"
    OTHER = "other"


class TrackingStatus(str, Enum):
    INTERESTED = "interested"
    FUNDING_APPLICATION = "funding_application"
    APPLIED = "applied"
    REGISTERED = "registered"
    ATTENDED = "attended"


class ConferenceSourceRef(BaseModel):
    source: str
    source_url: Optional[str] = None


class MatchReason(BaseModel):
    factor: str
    points: int
    why: str


class ConferenceDeadline(BaseModel):
    kind: DeadlineKind
    deadline_at: Optional[date] = None
    is_rolling: bool = False
    is_unknown: bool = False
    source_url: Optional[str] = None


class ConferenceFunding(BaseModel):
    name: str
    kind: FundingKind = FundingKind.OTHER
    amount: Optional[str] = None
    deadline: Optional[date] = None
    application_url: Optional[str] = None
    requirements_text: Optional[str] = None
    undergraduate_eligible: Optional[bool] = None
    paper_required: Optional[bool] = None
    citizenship_requirements: Optional[str] = None
    eligibility_status: EligibilityStatus = EligibilityStatus.NEEDS_VERIFICATION
    source_url: Optional[str] = None


class Conference(BaseModel):
    name: str
    organization: Optional[str] = None
    description: Optional[str] = None
    official_url: Optional[str] = None
    source: str
    source_url: Optional[str] = None
    location: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    is_virtual: bool = False
    location_status: LocationStatus = LocationStatus.UNKNOWN
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    call_for_papers_deadline: Optional[date] = None
    paper_submission_deadline: Optional[date] = None
    abstract_deadline: Optional[date] = None
    registration_deadline: Optional[date] = None
    student_registration_deadline: Optional[date] = None
    funding_deadline: Optional[date] = None
    application_deadline: Optional[date] = None
    conference_type: Optional[str] = None
    topics: list[str] = Field(default_factory=list)
    student_eligible: Optional[bool] = None
    undergraduate_eligible: Optional[bool] = None
    graduate_eligible: Optional[bool] = None
    funding_available: Optional[bool] = None
    travel_grant_available: Optional[bool] = None
    registration_waiver_available: Optional[bool] = None
    scholarship_available: Optional[bool] = None
    funding_amount: Optional[str] = None
    funding_requirements: Optional[str] = None
    citizenship_requirements: Optional[str] = None
    residency_requirements: Optional[str] = None
    eligibility_requirements: Optional[str] = None
    application_url: Optional[str] = None
    fingerprint: str
    sources: list[ConferenceSourceRef] = Field(default_factory=list)
    status: str = "unknown"
    last_verified_at: Optional[datetime] = None
    eligibility_status: EligibilityStatus = EligibilityStatus.NEEDS_VERIFICATION
    funding_status: FundingStatus = FundingStatus.FUNDING_UNKNOWN
    citizenship_status: EligibilityStatus = EligibilityStatus.ELIGIBLE
    funding_eligibility_status: EligibilityStatus = EligibilityStatus.NEEDS_VERIFICATION
    match_score: int = Field(default=0, ge=0, le=100)
    match_reasons: list[MatchReason] = Field(default_factory=list)
    deadlines: list[ConferenceDeadline] = Field(default_factory=list)
    funding: list[ConferenceFunding] = Field(default_factory=list)
    extra: dict[str, Any] = Field(default_factory=dict)
