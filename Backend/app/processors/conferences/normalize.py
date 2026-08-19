"""Normalize raw conference dicts into the shared Conference model."""

from __future__ import annotations

from datetime import date
from typing import Any, Optional

from model.conference import (
    Conference,
    ConferenceSourceRef,
    FundingStatus,
    LocationStatus,
)
from processors.conferences.deadlines import collect_deadlines
from processors.conferences.dates import parse_date_range, parse_iso_date
from processors.conferences.topics import classify_topics
from processors.location import (
    classify_conference_location,
    is_virtual_location,
    parse_location_parts,
)
from utils.fingerprint import create_conference_fingerprint


def normalize_conference(raw: dict[str, Any]) -> Conference:
    name = str(raw.get("name") or "").strip()
    if not name:
        raise ValueError("Conference is missing name")

    location = (raw.get("location") or None)
    if isinstance(location, str):
        location = location.strip() or None

    is_virtual = raw.get("is_virtual")
    if is_virtual is None:
        is_virtual = is_virtual_location(location)
    location_status = LocationStatus(
        classify_conference_location(location, is_virtual=bool(is_virtual))
    )
    city = raw.get("city")
    state = raw.get("state")
    country = raw.get("country")
    parsed_city, parsed_state, parsed_country = parse_location_parts(location)
    city = city or parsed_city
    state = state or parsed_state
    country = country or parsed_country

    start = parse_iso_date(raw.get("start_date"))
    end = parse_iso_date(raw.get("end_date"))
    if start is None and raw.get("date_text"):
        start, end = parse_date_range(
            str(raw.get("date_text")),
            year=_as_int(raw.get("year")),
            month=_as_int(raw.get("month")),
        )

    cfp = parse_iso_date(raw.get("call_for_papers_deadline"))
    paper = parse_iso_date(raw.get("paper_submission_deadline"))
    abstract = parse_iso_date(raw.get("abstract_deadline"))
    registration = parse_iso_date(raw.get("registration_deadline"))
    student_reg = parse_iso_date(raw.get("student_registration_deadline"))
    funding_deadline = parse_iso_date(raw.get("funding_deadline"))
    application = parse_iso_date(raw.get("application_deadline"))

    official_url = _clean_url(raw.get("official_url") or raw.get("url") or raw.get("hyperlink"))
    source = str(raw.get("source") or "unknown")
    source_url = _clean_url(raw.get("source_url"))
    organization = (str(raw["organization"]).strip() if raw.get("organization") else None)

    fingerprint = str(raw.get("fingerprint") or "") or create_conference_fingerprint(
        name=name,
        organization=organization,
        start_date=start,
        city=city,
        official_url=official_url,
    )

    topics = list(raw.get("topics") or [])
    if not topics:
        topics = classify_topics(name, raw.get("description"), raw.get("conference_type"))

    sources = list(raw.get("sources") or [])
    if not sources:
        sources = [ConferenceSourceRef(source=source, source_url=source_url or official_url)]
    else:
        sources = [
            item
            if isinstance(item, ConferenceSourceRef)
            else ConferenceSourceRef(**item)
            for item in sources
        ]

    deadlines = list(raw.get("deadlines") or [])
    if not deadlines:
        deadlines = collect_deadlines(
            call_for_papers_deadline=cfp,
            paper_submission_deadline=paper,
            abstract_deadline=abstract,
            registration_deadline=registration,
            student_registration_deadline=student_reg,
            funding_deadline=funding_deadline,
            application_deadline=application,
            extra_text=raw.get("deadline_text"),
            source_url=official_url,
        )

    funding_status = raw.get("funding_status") or FundingStatus.FUNDING_UNKNOWN
    if not isinstance(funding_status, FundingStatus):
        funding_status = FundingStatus(str(funding_status))

    status = str(raw.get("status") or "unknown")
    if start and start < date.today() and (not end or end < date.today()):
        if status == "unknown":
            status = "past"
    elif start and start <= date.today() and (end is None or end >= date.today()):
        if status == "unknown":
            status = "ongoing"
    elif start and start > date.today():
        if status == "unknown":
            status = "upcoming"

    return Conference(
        name=name,
        organization=organization,
        description=(str(raw["description"]).strip() if raw.get("description") else None),
        official_url=official_url,
        source=source,
        source_url=source_url,
        location=location,
        country=country,
        city=city,
        state=state,
        is_virtual=bool(is_virtual) or location_status == LocationStatus.VIRTUAL,
        location_status=location_status,
        start_date=start,
        end_date=end,
        call_for_papers_deadline=cfp,
        paper_submission_deadline=paper,
        abstract_deadline=abstract,
        registration_deadline=registration,
        student_registration_deadline=student_reg,
        funding_deadline=funding_deadline,
        application_deadline=application,
        conference_type=raw.get("conference_type"),
        topics=topics,
        student_eligible=raw.get("student_eligible"),
        undergraduate_eligible=raw.get("undergraduate_eligible"),
        graduate_eligible=raw.get("graduate_eligible"),
        funding_available=raw.get("funding_available"),
        travel_grant_available=raw.get("travel_grant_available"),
        registration_waiver_available=raw.get("registration_waiver_available"),
        scholarship_available=raw.get("scholarship_available"),
        funding_amount=raw.get("funding_amount"),
        funding_requirements=raw.get("funding_requirements"),
        citizenship_requirements=raw.get("citizenship_requirements"),
        residency_requirements=raw.get("residency_requirements"),
        eligibility_requirements=raw.get("eligibility_requirements"),
        application_url=_clean_url(raw.get("application_url")),
        fingerprint=fingerprint,
        sources=sources,
        status=status,
        last_verified_at=raw.get("last_verified_at"),
        funding_status=funding_status,
        deadlines=deadlines,
        funding=list(raw.get("funding") or []),
    )


def _clean_url(value: Any) -> Optional[str]:
    if not value or not isinstance(value, str):
        return None
    text = value.strip()
    return text or None


def _as_int(value: Any) -> Optional[int]:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
