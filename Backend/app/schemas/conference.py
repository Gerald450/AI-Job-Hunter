from __future__ import annotations

from datetime import date, datetime
from typing import Optional
from uuid import UUID

from processors.conferences.dates import days_until, is_closing_soon, is_expired
from pydantic import BaseModel, ConfigDict, Field, computed_field


class DeadlineResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    kind: str
    deadline_at: Optional[date] = None
    is_rolling: bool = False
    is_unknown: bool = False
    source_url: Optional[str] = None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def days_until_deadline(self) -> Optional[int]:
        return days_until(self.deadline_at)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def expired(self) -> bool:
        return is_expired(self.deadline_at)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def closing_soon(self) -> bool:
        return is_closing_soon(self.deadline_at)


class FundingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    name: str
    kind: str
    amount: Optional[str] = None
    deadline: Optional[date] = None
    application_url: Optional[str] = None
    requirements_text: Optional[str] = None
    undergraduate_eligible: Optional[bool] = None
    paper_required: Optional[bool] = None
    citizenship_requirements: Optional[str] = None
    eligibility_status: str
    source_url: Optional[str] = None


class MatchReasonResponse(BaseModel):
    factor: str
    points: int
    why: str


class ConferenceSourceResponse(BaseModel):
    source: str
    source_url: Optional[str] = None


class ConferenceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
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
    location_status: str
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
    funding_deadline: Optional[date] = None
    funding_requirements: Optional[str] = None
    citizenship_requirements: Optional[str] = None
    residency_requirements: Optional[str] = None
    eligibility_requirements: Optional[str] = None
    application_url: Optional[str] = None
    status: str
    last_verified_at: Optional[datetime] = None
    eligibility_status: str
    funding_status: str
    citizenship_status: str
    funding_eligibility_status: str
    match_score: int = 0
    match_reasons: list[MatchReasonResponse] = Field(default_factory=list)
    sources: list[ConferenceSourceResponse] = Field(default_factory=list)
    funding: list[FundingResponse] = Field(default_factory=list)
    deadlines: list[DeadlineResponse] = Field(default_factory=list)
    saved: bool = False
    saved_at: Optional[datetime] = None
    tracking_status: Optional[str] = None
    tracking_updated_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class ConferenceStatsResponse(BaseModel):
    recommended: int = 0
    with_funding: int = 0
    travel_grants: int = 0
    deadlines_this_month: int = 0


class SavedUpdate(BaseModel):
    saved: bool


class TrackingUpdate(BaseModel):
    status: Optional[str] = None


class ConferenceListResponse(BaseModel):
    conferences: list[ConferenceResponse]
    total: int
    has_more: bool


class ConferenceDeadlineListResponse(BaseModel):
    deadlines: list[dict]
    total: int


class ConferenceFundingListResponse(BaseModel):
    funding: list[dict]
    total: int


class ConferenceEligibilityResponse(BaseModel):
    counts: dict[str, int]
    conferences: list[ConferenceResponse] = Field(default_factory=list)


def conference_to_response(row) -> ConferenceResponse:
    """Map an ORM conference (with children) to the API schema."""
    funding = [
        FundingResponse(
            name=item.name,
            kind=item.kind,
            amount=item.amount,
            deadline=item.deadline,
            application_url=item.application_url,
            requirements_text=item.requirements_text,
            undergraduate_eligible=item.undergraduate_eligible,
            paper_required=item.paper_required,
            citizenship_requirements=item.citizenship_requirements,
            eligibility_status=item.eligibility_status,
            source_url=item.source_url,
        )
        for item in (row.funding_rows or [])
    ]
    deadlines = [
        DeadlineResponse(
            kind=item.kind,
            deadline_at=item.deadline_at,
            is_rolling=item.is_rolling,
            is_unknown=item.is_unknown,
            source_url=item.source_url,
        )
        for item in (row.deadline_rows or [])
    ]
    reasons = [
        MatchReasonResponse(**item) if isinstance(item, dict) else item
        for item in (row.match_reasons or [])
    ]
    sources = [
        ConferenceSourceResponse(**item) if isinstance(item, dict) else item
        for item in (row.sources or [])
    ]
    return ConferenceResponse(
        id=row.id,
        name=row.name,
        organization=row.organization,
        description=row.description,
        official_url=row.official_url,
        source=row.source,
        source_url=row.source_url,
        location=row.location,
        country=row.country,
        city=row.city,
        state=row.state,
        is_virtual=row.is_virtual,
        location_status=row.location_status,
        start_date=row.start_date,
        end_date=row.end_date,
        call_for_papers_deadline=row.call_for_papers_deadline,
        paper_submission_deadline=row.paper_submission_deadline,
        abstract_deadline=row.abstract_deadline,
        registration_deadline=row.registration_deadline,
        student_registration_deadline=row.student_registration_deadline,
        funding_deadline=row.funding_deadline,
        application_deadline=row.application_deadline,
        conference_type=row.conference_type,
        topics=list(row.topics or []),
        student_eligible=row.student_eligible,
        undergraduate_eligible=row.undergraduate_eligible,
        graduate_eligible=row.graduate_eligible,
        funding_available=row.funding_available,
        travel_grant_available=row.travel_grant_available,
        registration_waiver_available=row.registration_waiver_available,
        scholarship_available=row.scholarship_available,
        funding_amount=row.funding_amount,
        funding_requirements=row.funding_requirements,
        citizenship_requirements=row.citizenship_requirements,
        residency_requirements=row.residency_requirements,
        eligibility_requirements=row.eligibility_requirements,
        application_url=row.application_url,
        status=row.status,
        last_verified_at=row.last_verified_at,
        eligibility_status=row.eligibility_status,
        funding_status=row.funding_status,
        citizenship_status=row.citizenship_status,
        funding_eligibility_status=row.funding_eligibility_status,
        match_score=row.match_score or 0,
        match_reasons=reasons,
        sources=sources,
        funding=funding,
        deadlines=deadlines,
        saved=bool(getattr(row, "saved", False)),
        saved_at=getattr(row, "saved_at", None),
        tracking_status=getattr(row, "tracking_status", None),
        tracking_updated_at=getattr(row, "tracking_updated_at", None),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )
