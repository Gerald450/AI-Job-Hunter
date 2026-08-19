"""Conference HTTP routes. Included from api.py; does not change job routes."""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from database.conference_crud import (
    TRACKING_STATUSES,
    get_conference_by_id,
    get_conference_deadlines,
    get_conference_funding,
    get_conference_stats,
    get_conferences,
    get_eligibility_breakdown,
    set_conference_saved,
    set_conference_tracking,
)
from fastapi import APIRouter, Depends, HTTPException, Query
from schemas.conference import (
    ConferenceDeadlineListResponse,
    ConferenceEligibilityResponse,
    ConferenceFundingListResponse,
    ConferenceListResponse,
    ConferenceResponse,
    ConferenceStatsResponse,
    SavedUpdate,
    TrackingUpdate,
    conference_to_response,
)
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/conferences", tags=["conferences"])


def get_db():
    from clients.db import SessionLocal

    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _common_filters(
    include_unknown_locations: bool,
    include_non_us: bool,
    include_not_eligible: bool,
    location: Optional[str],
    location_status: Optional[str],
    virtual: Optional[bool],
    eligibility: Optional[str],
    min_match_score: Optional[int],
    funding_available: Optional[bool],
    travel_grant_available: Optional[bool],
    registration_waiver_available: Optional[bool],
    scholarship_available: Optional[bool],
    funding_eligibility: Optional[str],
    deadline: Optional[str],
    topic: Optional[str],
    source: Optional[str],
    search: Optional[str],
    saved: Optional[bool],
    tracking_status: Optional[str],
) -> dict:
    return {
        "include_unknown_locations": include_unknown_locations,
        "include_non_us": include_non_us,
        "include_not_eligible": include_not_eligible,
        "location": location,
        "location_status": location_status,
        "virtual": virtual,
        "eligibility": eligibility,
        "min_match_score": min_match_score,
        "funding_available": funding_available,
        "travel_grant_available": travel_grant_available,
        "registration_waiver_available": registration_waiver_available,
        "scholarship_available": scholarship_available,
        "funding_eligibility": funding_eligibility,
        "deadline": deadline,
        "topic": topic,
        "source": source,
        "search": search,
        "saved": saved,
        "tracking_status": tracking_status,
    }


@router.get("", response_model=ConferenceListResponse)
def list_conferences(
    location: Optional[str] = Query(None),
    location_status: Optional[str] = Query(None),
    virtual: Optional[bool] = Query(None),
    eligibility: Optional[str] = Query(None),
    min_match_score: Optional[int] = Query(None, alias="match_score", ge=0, le=100),
    funding_available: Optional[bool] = Query(None),
    travel_grant_available: Optional[bool] = Query(None),
    registration_waiver_available: Optional[bool] = Query(None),
    scholarship_available: Optional[bool] = Query(None),
    funding_eligibility: Optional[str] = Query(None),
    deadline: Optional[str] = Query(None),
    topic: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    saved: Optional[bool] = Query(None),
    tracking_status: Optional[str] = Query(None),
    include_unknown_locations: bool = Query(False),
    include_non_us: bool = Query(False),
    include_not_eligible: bool = Query(False),
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    rows, total = get_conferences(
        db,
        **_common_filters(
            include_unknown_locations,
            include_non_us,
            include_not_eligible,
            location,
            location_status,
            virtual,
            eligibility,
            min_match_score,
            funding_available,
            travel_grant_available,
            registration_waiver_available,
            scholarship_available,
            funding_eligibility,
            deadline,
            topic,
            source,
            search,
            saved,
            tracking_status,
        ),
        recommended=False,
        limit=limit,
        offset=offset,
    )
    return ConferenceListResponse(
        conferences=[conference_to_response(row) for row in rows],
        total=total,
        has_more=offset + len(rows) < total,
    )


@router.get("/recommended", response_model=ConferenceListResponse)
def recommended_conferences(
    location: Optional[str] = Query(None),
    location_status: Optional[str] = Query(None),
    virtual: Optional[bool] = Query(None),
    eligibility: Optional[str] = Query(None),
    min_match_score: Optional[int] = Query(None, alias="match_score", ge=0, le=100),
    funding_available: Optional[bool] = Query(None),
    travel_grant_available: Optional[bool] = Query(None),
    registration_waiver_available: Optional[bool] = Query(None),
    scholarship_available: Optional[bool] = Query(None),
    funding_eligibility: Optional[str] = Query(None),
    deadline: Optional[str] = Query(None),
    topic: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    saved: Optional[bool] = Query(None),
    tracking_status: Optional[str] = Query(None),
    include_unknown_locations: bool = Query(False),
    include_non_us: bool = Query(False),
    include_not_eligible: bool = Query(False),
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    rows, total = get_conferences(
        db,
        **_common_filters(
            include_unknown_locations,
            include_non_us,
            include_not_eligible,
            location,
            location_status,
            virtual,
            eligibility,
            min_match_score,
            funding_available,
            travel_grant_available,
            registration_waiver_available,
            scholarship_available,
            funding_eligibility,
            deadline,
            topic,
            source,
            search,
            saved,
            tracking_status,
        ),
        recommended=True,
        limit=limit,
        offset=offset,
    )
    return ConferenceListResponse(
        conferences=[conference_to_response(row) for row in rows],
        total=total,
        has_more=offset + len(rows) < total,
    )


@router.get("/stats", response_model=ConferenceStatsResponse)
def conference_stats(
    include_unknown_locations: bool = Query(False),
    include_non_us: bool = Query(False),
    include_not_eligible: bool = Query(False),
    db: Session = Depends(get_db),
):
    return ConferenceStatsResponse(
        **get_conference_stats(
            db,
            include_unknown_locations=include_unknown_locations,
            include_non_us=include_non_us,
            include_not_eligible=include_not_eligible,
        )
    )


@router.get("/deadlines", response_model=ConferenceDeadlineListResponse)
def list_deadlines(
    include_unknown_locations: bool = Query(False),
    include_non_us: bool = Query(False),
    include_not_eligible: bool = Query(False),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    pairs = get_conference_deadlines(
        db,
        include_unknown_locations=include_unknown_locations,
        include_non_us=include_non_us,
        include_not_eligible=include_not_eligible,
        limit=limit,
    )
    items = []
    for conference, deadline in pairs:
        from schemas.conference import DeadlineResponse

        payload = DeadlineResponse.model_validate(deadline).model_dump()
        payload["conference_id"] = str(conference.id)
        payload["conference_name"] = conference.name
        items.append(payload)
    return ConferenceDeadlineListResponse(deadlines=items, total=len(items))


@router.get("/funding", response_model=ConferenceFundingListResponse)
def list_funding(
    include_unknown_locations: bool = Query(False),
    include_non_us: bool = Query(False),
    include_not_eligible: bool = Query(False),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    pairs = get_conference_funding(
        db,
        include_unknown_locations=include_unknown_locations,
        include_non_us=include_non_us,
        include_not_eligible=include_not_eligible,
        limit=limit,
    )
    items = []
    for conference, grant in pairs:
        from schemas.conference import FundingResponse

        payload = FundingResponse.model_validate(grant).model_dump()
        payload["conference_id"] = str(conference.id)
        payload["conference_name"] = conference.name
        items.append(payload)
    return ConferenceFundingListResponse(funding=items, total=len(items))


@router.get("/eligibility", response_model=ConferenceEligibilityResponse)
def eligibility_breakdown(
    include_unknown_locations: bool = Query(False),
    include_non_us: bool = Query(False),
    include_not_eligible: bool = Query(True),
    eligibility: Optional[str] = Query(None),
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    counts = get_eligibility_breakdown(
        db,
        include_unknown_locations=include_unknown_locations,
        include_non_us=include_non_us,
    )
    rows, _ = get_conferences(
        db,
        include_unknown_locations=include_unknown_locations,
        include_non_us=include_non_us,
        include_not_eligible=include_not_eligible,
        eligibility=eligibility,
        limit=limit,
        offset=offset,
    )
    return ConferenceEligibilityResponse(
        counts=counts,
        conferences=[conference_to_response(row) for row in rows],
    )


@router.get("/{conference_id}", response_model=ConferenceResponse)
def get_conference(conference_id: UUID, db: Session = Depends(get_db)):
    row = get_conference_by_id(db, conference_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Conference not found")
    return conference_to_response(row)


@router.patch("/{conference_id}/saved", response_model=ConferenceResponse)
def update_conference_saved(
    conference_id: UUID,
    body: SavedUpdate,
    db: Session = Depends(get_db),
):
    row = set_conference_saved(db, conference_id, body.saved)
    if row is None:
        raise HTTPException(status_code=404, detail="Conference not found")
    return conference_to_response(row)


@router.patch("/{conference_id}/tracking", response_model=ConferenceResponse)
def update_conference_tracking(
    conference_id: UUID,
    body: TrackingUpdate,
    db: Session = Depends(get_db),
):
    status = body.status.strip().lower() if body.status else None
    if status == "":
        status = None
    if status is not None and status not in TRACKING_STATUSES:
        raise HTTPException(status_code=422, detail="Invalid tracking status")
    row = set_conference_tracking(db, conference_id, status)
    if row is None:
        raise HTTPException(status_code=404, detail="Conference not found")
    return conference_to_response(row)
