"""CRUD helpers for conferences, funding rows, and typed deadlines."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from database.conferencemodel import (
    ConferenceDeadlineModel,
    ConferenceFundingModel,
    ConferenceModel,
)
from model.conference import Conference, TrackingStatus
from sqlalchemy import and_, exists, func, not_, or_, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session, selectinload

CLOSING_SOON_DAYS = 14
COMMUNITY_SOURCES = ("developers_events", "awesome_ai")
TRACKING_STATUSES = {item.value for item in TrackingStatus}

ELIGIBILITY_RANK = {
    "ELIGIBLE": 0,
    "LIKELY_ELIGIBLE": 1,
    "NEEDS_VERIFICATION": 2,
    "NOT_ELIGIBLE": 3,
}


def _conference_row(conference: Conference, now: datetime) -> dict[str, Any]:
    row = ConferenceModel.from_conference(conference)
    return {
        "id": row.id,
        "name": conference.name,
        "organization": conference.organization,
        "description": conference.description,
        "official_url": conference.official_url,
        "source": conference.source,
        "source_url": conference.source_url,
        "location": conference.location,
        "country": conference.country,
        "city": conference.city,
        "state": conference.state,
        "is_virtual": conference.is_virtual,
        "location_status": conference.location_status.value,
        "start_date": conference.start_date,
        "end_date": conference.end_date,
        "call_for_papers_deadline": conference.call_for_papers_deadline,
        "paper_submission_deadline": conference.paper_submission_deadline,
        "abstract_deadline": conference.abstract_deadline,
        "registration_deadline": conference.registration_deadline,
        "student_registration_deadline": conference.student_registration_deadline,
        "funding_deadline": conference.funding_deadline,
        "application_deadline": conference.application_deadline,
        "conference_type": conference.conference_type,
        "topics": list(conference.topics),
        "student_eligible": conference.student_eligible,
        "undergraduate_eligible": conference.undergraduate_eligible,
        "graduate_eligible": conference.graduate_eligible,
        "funding_available": conference.funding_available,
        "travel_grant_available": conference.travel_grant_available,
        "registration_waiver_available": conference.registration_waiver_available,
        "scholarship_available": conference.scholarship_available,
        "funding_amount": conference.funding_amount,
        "funding_requirements": conference.funding_requirements,
        "citizenship_requirements": conference.citizenship_requirements,
        "residency_requirements": conference.residency_requirements,
        "eligibility_requirements": conference.eligibility_requirements,
        "application_url": conference.application_url,
        "fingerprint": conference.fingerprint,
        "sources": [s.model_dump() for s in conference.sources],
        "status": conference.status,
        "last_verified_at": conference.last_verified_at,
        "eligibility_status": conference.eligibility_status.value,
        "funding_status": conference.funding_status.value,
        "citizenship_status": conference.citizenship_status.value,
        "funding_eligibility_status": conference.funding_eligibility_status.value,
        "match_score": conference.match_score,
        "match_reasons": [r.model_dump() for r in conference.match_reasons],
        "created_at": now,
        "updated_at": now,
    }


def insert_conferences(db: Session, conferences: list[Conference]) -> dict:
    """Upsert conferences by fingerprint and replace child funding/deadlines."""
    if not conferences:
        return {"submitted": 0}

    now = datetime.now(timezone.utc)
    rows = [_conference_row(conference, now) for conference in conferences]
    stmt = insert(ConferenceModel).values(rows)
    excluded = stmt.excluded
    stmt = stmt.on_conflict_do_update(
        index_elements=["fingerprint"],
        set_={
            "name": excluded.name,
            "organization": text(
                "COALESCE(EXCLUDED.organization, conferences.organization)"
            ),
            "description": text(
                "COALESCE(EXCLUDED.description, conferences.description)"
            ),
            "official_url": text(
                "COALESCE(EXCLUDED.official_url, conferences.official_url)"
            ),
            "source": excluded.source,
            "source_url": text(
                "COALESCE(EXCLUDED.source_url, conferences.source_url)"
            ),
            "location": text("COALESCE(EXCLUDED.location, conferences.location)"),
            "country": text("COALESCE(EXCLUDED.country, conferences.country)"),
            "city": text("COALESCE(EXCLUDED.city, conferences.city)"),
            "state": text("COALESCE(EXCLUDED.state, conferences.state)"),
            "is_virtual": excluded.is_virtual,
            "location_status": excluded.location_status,
            "start_date": text(
                "COALESCE(EXCLUDED.start_date, conferences.start_date)"
            ),
            "end_date": text("COALESCE(EXCLUDED.end_date, conferences.end_date)"),
            "call_for_papers_deadline": text(
                "COALESCE(EXCLUDED.call_for_papers_deadline, "
                "conferences.call_for_papers_deadline)"
            ),
            "paper_submission_deadline": text(
                "COALESCE(EXCLUDED.paper_submission_deadline, "
                "conferences.paper_submission_deadline)"
            ),
            "abstract_deadline": text(
                "COALESCE(EXCLUDED.abstract_deadline, conferences.abstract_deadline)"
            ),
            "registration_deadline": text(
                "COALESCE(EXCLUDED.registration_deadline, "
                "conferences.registration_deadline)"
            ),
            "student_registration_deadline": text(
                "COALESCE(EXCLUDED.student_registration_deadline, "
                "conferences.student_registration_deadline)"
            ),
            "funding_deadline": text(
                "COALESCE(EXCLUDED.funding_deadline, conferences.funding_deadline)"
            ),
            "application_deadline": text(
                "COALESCE(EXCLUDED.application_deadline, "
                "conferences.application_deadline)"
            ),
            "conference_type": text(
                "COALESCE(EXCLUDED.conference_type, conferences.conference_type)"
            ),
            "topics": excluded.topics,
            "student_eligible": excluded.student_eligible,
            "undergraduate_eligible": excluded.undergraduate_eligible,
            "graduate_eligible": excluded.graduate_eligible,
            "funding_available": excluded.funding_available,
            "travel_grant_available": excluded.travel_grant_available,
            "registration_waiver_available": excluded.registration_waiver_available,
            "scholarship_available": excluded.scholarship_available,
            "funding_amount": text(
                "COALESCE(EXCLUDED.funding_amount, conferences.funding_amount)"
            ),
            "funding_requirements": text(
                "COALESCE(EXCLUDED.funding_requirements, "
                "conferences.funding_requirements)"
            ),
            "citizenship_requirements": text(
                "COALESCE(EXCLUDED.citizenship_requirements, "
                "conferences.citizenship_requirements)"
            ),
            "residency_requirements": text(
                "COALESCE(EXCLUDED.residency_requirements, "
                "conferences.residency_requirements)"
            ),
            "eligibility_requirements": text(
                "COALESCE(EXCLUDED.eligibility_requirements, "
                "conferences.eligibility_requirements)"
            ),
            "application_url": text(
                "COALESCE(EXCLUDED.application_url, conferences.application_url)"
            ),
            "sources": excluded.sources,
            "status": excluded.status,
            "last_verified_at": text(
                "COALESCE(EXCLUDED.last_verified_at, conferences.last_verified_at)"
            ),
            "eligibility_status": excluded.eligibility_status,
            "funding_status": excluded.funding_status,
            "citizenship_status": excluded.citizenship_status,
            "funding_eligibility_status": excluded.funding_eligibility_status,
            "match_score": excluded.match_score,
            "match_reasons": excluded.match_reasons,
            "updated_at": now,
        },
    )
    db.execute(stmt)
    db.flush()

    fingerprints = [conference.fingerprint for conference in conferences]
    stored = (
        db.query(ConferenceModel)
        .filter(ConferenceModel.fingerprint.in_(fingerprints))
        .all()
    )
    by_fp = {row.fingerprint: row for row in stored}

    for conference in conferences:
        row = by_fp.get(conference.fingerprint)
        if row is None:
            continue
        db.query(ConferenceFundingModel).filter(
            ConferenceFundingModel.conference_id == row.id
        ).delete(synchronize_session=False)
        db.query(ConferenceDeadlineModel).filter(
            ConferenceDeadlineModel.conference_id == row.id
        ).delete(synchronize_session=False)
        for grant in conference.funding:
            db.add(
                ConferenceFundingModel(
                    conference_id=row.id,
                    name=grant.name,
                    kind=grant.kind.value,
                    amount=grant.amount,
                    deadline=grant.deadline,
                    application_url=grant.application_url,
                    requirements_text=grant.requirements_text,
                    undergraduate_eligible=grant.undergraduate_eligible,
                    paper_required=grant.paper_required,
                    citizenship_requirements=grant.citizenship_requirements,
                    eligibility_status=grant.eligibility_status.value,
                    source_url=grant.source_url,
                )
            )
        for deadline in conference.deadlines:
            db.add(
                ConferenceDeadlineModel(
                    conference_id=row.id,
                    kind=deadline.kind.value,
                    deadline_at=deadline.deadline_at,
                    is_rolling=deadline.is_rolling,
                    is_unknown=deadline.is_unknown,
                    source_url=deadline.source_url,
                )
            )

    db.commit()
    return {"submitted": len(rows)}


def _is_online_sql():
    return or_(
        ConferenceModel.is_virtual.is_(True),
        ConferenceModel.location_status == "VIRTUAL",
    )


def _has_student_funding_sql():
    has_child = exists().where(
        ConferenceFundingModel.conference_id == ConferenceModel.id
    )
    return or_(
        ConferenceModel.funding_available.is_(True),
        ConferenceModel.travel_grant_available.is_(True),
        ConferenceModel.scholarship_available.is_(True),
        ConferenceModel.registration_waiver_available.is_(True),
        has_child,
    )


def _event_date_sql():
    return func.coalesce(ConferenceModel.end_date, ConferenceModel.start_date)


def _is_past_sql(*, today: Optional[date] = None):
    current = today or date.today()
    event_date = _event_date_sql()
    return and_(event_date.isnot(None), event_date < current)


def delete_virtual_and_unfunded_conferences(db: Session) -> int:
    """Remove online, unfunded, and already-ended conferences."""
    stale = db.query(ConferenceModel).filter(
        or_(
            _is_online_sql(),
            not_(_has_student_funding_sql()),
            _is_past_sql(),
        )
    )
    deleted = stale.delete(synchronize_session=False)
    db.commit()
    return int(deleted or 0)


def _base_query(
    db: Session,
    *,
    include_unknown_locations: bool = False,
    include_non_us: bool = False,
    include_not_eligible: bool = False,
):
    query = db.query(ConferenceModel).options(
        selectinload(ConferenceModel.funding_rows),
        selectinload(ConferenceModel.deadline_rows),
    )
    allowed_locations = ["US"]
    if include_unknown_locations:
        allowed_locations.append("UNKNOWN")
    if include_non_us:
        allowed_locations.append("NON_US")
    query = query.filter(ConferenceModel.location_status.in_(allowed_locations))
    query = query.filter(ConferenceModel.is_virtual.is_(False))
    query = query.filter(_has_student_funding_sql())
    query = query.filter(not_(_is_past_sql()))
    if not include_not_eligible:
        query = query.filter(ConferenceModel.eligibility_status != "NOT_ELIGIBLE")
    return query


def _soonest_deadline(row: ConferenceModel) -> Optional[date]:
    dates = [
        row.call_for_papers_deadline,
        row.paper_submission_deadline,
        row.abstract_deadline,
        row.registration_deadline,
        row.student_registration_deadline,
        row.funding_deadline,
        row.application_deadline,
    ]
    for child in row.deadline_rows:
        dates.append(child.deadline_at)
    present = [value for value in dates if value is not None]
    return min(present) if present else None


def _matches_deadline_filter(
    row: ConferenceModel,
    deadline: str,
    *,
    today: date,
) -> bool:
    soonest = _soonest_deadline(row)
    if deadline == "upcoming":
        return soonest is not None and soonest >= today
    if deadline == "expired":
        return soonest is not None and soonest < today
    if deadline == "closing_soon":
        if soonest is None:
            return False
        return today <= soonest <= today + timedelta(days=CLOSING_SOON_DAYS)
    if deadline == "this_month":
        if soonest is None:
            return False
        return (
            soonest >= today
            and soonest.year == today.year
            and soonest.month == today.month
        )
    if deadline == "next_3_months":
        if soonest is None:
            return False
        return today <= soonest <= today + timedelta(days=93)
    return True


def get_conferences(
    db: Session,
    *,
    include_unknown_locations: bool = False,
    include_non_us: bool = False,
    include_not_eligible: bool = False,
    location: Optional[str] = None,
    location_status: Optional[str] = None,
    virtual: Optional[bool] = None,
    eligibility: Optional[str] = None,
    min_match_score: Optional[int] = None,
    funding_available: Optional[bool] = None,
    travel_grant_available: Optional[bool] = None,
    registration_waiver_available: Optional[bool] = None,
    scholarship_available: Optional[bool] = None,
    funding_eligibility: Optional[str] = None,
    deadline: Optional[str] = None,
    topic: Optional[str] = None,
    source: Optional[str] = None,
    search: Optional[str] = None,
    saved: Optional[bool] = None,
    tracking_status: Optional[str] = None,
    recommended: bool = False,
    limit: int = 25,
    offset: int = 0,
) -> tuple[list[ConferenceModel], int]:
    query = _base_query(
        db,
        include_unknown_locations=include_unknown_locations,
        include_non_us=include_non_us,
        include_not_eligible=include_not_eligible,
    )
    if location:
        query = query.filter(ConferenceModel.location.ilike(f"%{location.strip()}%"))
    if location_status:
        status = location_status.strip().upper()
        query = query.filter(ConferenceModel.location_status == status)
    if virtual is True:
        query = query.filter(ConferenceModel.is_virtual.is_(True))
    elif virtual is False:
        query = query.filter(ConferenceModel.is_virtual.is_(False))
    if eligibility:
        query = query.filter(
            ConferenceModel.eligibility_status == eligibility.strip().upper()
        )
    if min_match_score is not None:
        query = query.filter(ConferenceModel.match_score >= min_match_score)
    if funding_available is True:
        query = query.filter(ConferenceModel.funding_available.is_(True))
    elif funding_available is False:
        query = query.filter(
            or_(
                ConferenceModel.funding_available.is_(False),
                ConferenceModel.funding_available.is_(None),
            )
        )
    if travel_grant_available is True:
        query = query.filter(ConferenceModel.travel_grant_available.is_(True))
    if registration_waiver_available is True:
        query = query.filter(
            ConferenceModel.registration_waiver_available.is_(True)
        )
    if scholarship_available is True:
        query = query.filter(ConferenceModel.scholarship_available.is_(True))
    if funding_eligibility:
        query = query.filter(
            ConferenceModel.funding_eligibility_status
            == funding_eligibility.strip().upper()
        )
    if saved is True:
        query = query.filter(ConferenceModel.saved.is_(True))
    elif saved is False:
        query = query.filter(ConferenceModel.saved.is_(False))
    if tracking_status:
        query = query.filter(
            ConferenceModel.tracking_status == tracking_status.strip().lower()
        )
    if source:
        needle = source.strip().lower()
        if needle in {"community", "community_sources"}:
            query = query.filter(ConferenceModel.source.in_(COMMUNITY_SOURCES))
        else:
            query = query.filter(
                or_(
                    ConferenceModel.source.ilike(f"%{needle}%"),
                    ConferenceModel.official_url.ilike(f"%{needle}%"),
                )
            )
    if search:
        needle = f"%{search.strip()}%"
        query = query.filter(
            or_(
                ConferenceModel.name.ilike(needle),
                ConferenceModel.organization.ilike(needle),
                ConferenceModel.description.ilike(needle),
                ConferenceModel.location.ilike(needle),
            )
        )

    rows = query.all()
    today = date.today()
    if deadline:
        rows = [
            row
            for row in rows
            if _matches_deadline_filter(row, deadline.strip().lower(), today=today)
        ]
    if topic:
        needle = topic.strip().lower()
        rows = [
            row
            for row in rows
            if any(needle in str(item).lower() for item in (row.topics or []))
            or needle in (row.name or "").lower()
            or needle in (row.description or "").lower()
        ]

    if recommended:
        rows.sort(
            key=lambda row: (
                ELIGIBILITY_RANK.get(row.eligibility_status, 9),
                -_topic_bonus(row),
                0 if row.funding_available else 1,
                ELIGIBILITY_RANK.get(row.funding_eligibility_status, 9),
                _deadline_sort_key(row, today),
                -row.match_score,
                row.name,
            )
        )
    else:
        rows.sort(
            key=lambda row: (
                -row.match_score,
                _deadline_sort_key(row, today),
                row.name,
            )
        )

    total = len(rows)
    return rows[offset : offset + limit], total


def _topic_bonus(row: ConferenceModel) -> int:
    return len(row.topics or [])


def _deadline_sort_key(row: ConferenceModel, today: date) -> tuple[int, int]:
    soonest = _soonest_deadline(row)
    if soonest is None:
        return (1, 10**6)
    delta = (soonest - today).days
    if delta < 0:
        return (2, abs(delta))
    return (0, delta)


def get_conference_by_id(
    db: Session, conference_id: uuid.UUID
) -> Optional[ConferenceModel]:
    return (
        db.query(ConferenceModel)
        .options(
            selectinload(ConferenceModel.funding_rows),
            selectinload(ConferenceModel.deadline_rows),
        )
        .filter(ConferenceModel.id == conference_id)
        .first()
    )


def get_conference_deadlines(
    db: Session,
    *,
    include_unknown_locations: bool = False,
    include_non_us: bool = False,
    include_not_eligible: bool = False,
    limit: int = 100,
) -> list[tuple[ConferenceModel, ConferenceDeadlineModel]]:
    rows, _ = get_conferences(
        db,
        include_unknown_locations=include_unknown_locations,
        include_non_us=include_non_us,
        include_not_eligible=include_not_eligible,
        limit=500,
        offset=0,
    )
    today = date.today()
    items: list[tuple[ConferenceModel, ConferenceDeadlineModel]] = []
    for row in rows:
        for deadline in row.deadline_rows:
            items.append((row, deadline))
    items.sort(
        key=lambda pair: (
            1 if pair[1].deadline_at is None else 0,
            (pair[1].deadline_at - today).days
            if pair[1].deadline_at is not None
            else 10**6,
        )
    )
    return items[:limit]


def get_conference_funding(
    db: Session,
    *,
    include_unknown_locations: bool = False,
    include_non_us: bool = False,
    include_not_eligible: bool = False,
    limit: int = 100,
) -> list[tuple[ConferenceModel, ConferenceFundingModel]]:
    rows, _ = get_conferences(
        db,
        include_unknown_locations=include_unknown_locations,
        include_non_us=include_non_us,
        include_not_eligible=include_not_eligible,
        funding_available=True,
        limit=500,
        offset=0,
    )
    items: list[tuple[ConferenceModel, ConferenceFundingModel]] = []
    for row in rows:
        for grant in row.funding_rows:
            items.append((row, grant))
    return items[:limit]


def get_eligibility_breakdown(
    db: Session,
    *,
    include_unknown_locations: bool = False,
    include_non_us: bool = False,
) -> dict[str, int]:
    query = db.query(ConferenceModel)
    allowed = ["US"]
    if include_unknown_locations:
        allowed.append("UNKNOWN")
    if include_non_us:
        allowed.append("NON_US")
    query = query.filter(ConferenceModel.location_status.in_(allowed))
    query = query.filter(ConferenceModel.is_virtual.is_(False))
    query = query.filter(_has_student_funding_sql())
    query = query.filter(not_(_is_past_sql()))
    counts = {
        "ELIGIBLE": 0,
        "LIKELY_ELIGIBLE": 0,
        "NEEDS_VERIFICATION": 0,
        "NOT_ELIGIBLE": 0,
    }
    for row in query.all():
        counts[row.eligibility_status] = counts.get(row.eligibility_status, 0) + 1
    return counts


def get_conference_stats(
    db: Session,
    *,
    include_unknown_locations: bool = False,
    include_non_us: bool = False,
    include_not_eligible: bool = False,
) -> dict[str, int]:
    rows, total = get_conferences(
        db,
        include_unknown_locations=include_unknown_locations,
        include_non_us=include_non_us,
        include_not_eligible=include_not_eligible,
        recommended=True,
        limit=10_000,
        offset=0,
    )
    today = date.today()
    with_funding = sum(1 for row in rows if row.funding_available)
    travel_grants = sum(1 for row in rows if row.travel_grant_available)
    deadlines_this_month = 0
    for row in rows:
        soonest = _soonest_deadline(row)
        if soonest is None:
            continue
        if (
            soonest >= today
            and soonest.year == today.year
            and soonest.month == today.month
        ):
            deadlines_this_month += 1
    return {
        "recommended": total,
        "with_funding": with_funding,
        "travel_grants": travel_grants,
        "deadlines_this_month": deadlines_this_month,
    }


def set_conference_saved(
    db: Session, conference_id: uuid.UUID, saved: bool
) -> Optional[ConferenceModel]:
    row = get_conference_by_id(db, conference_id)
    if row is None:
        return None
    now = datetime.now(timezone.utc)
    row.saved = saved
    row.saved_at = now if saved else None
    row.updated_at = now
    db.commit()
    db.refresh(row)
    return row


def set_conference_tracking(
    db: Session, conference_id: uuid.UUID, status: Optional[str]
) -> Optional[ConferenceModel]:
    row = get_conference_by_id(db, conference_id)
    if row is None:
        return None
    cleaned = status.strip().lower() if status else None
    if cleaned == "":
        cleaned = None
    now = datetime.now(timezone.utc)
    row.tracking_status = cleaned
    row.tracking_updated_at = now if cleaned else None
    row.updated_at = now
    db.commit()
    db.refresh(row)
    return row
