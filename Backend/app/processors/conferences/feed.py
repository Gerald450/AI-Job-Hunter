"""Keep rules for conference persistence and the default listing feed."""

from __future__ import annotations

from datetime import date
from typing import Optional

from model.conference import Conference, EligibilityStatus, LocationStatus


def is_online_conference(conference: Conference) -> bool:
    return bool(conference.is_virtual) or conference.location_status == LocationStatus.VIRTUAL


def has_student_funding(conference: Conference) -> bool:
    if conference.funding_available is True:
        return True
    if conference.travel_grant_available is True:
        return True
    if conference.scholarship_available is True:
        return True
    if conference.registration_waiver_available is True:
        return True
    return bool(conference.funding)


def conference_event_date(conference: Conference) -> Optional[date]:
    return conference.end_date or conference.start_date


def is_past_conference(
    conference: Conference,
    *,
    today: Optional[date] = None,
) -> bool:
    """True when the event already ended before today. Unknown dates are not past."""
    event_date = conference_event_date(conference)
    if event_date is None:
        return False
    return event_date < (today or date.today())


def should_persist_conference(conference: Conference) -> bool:
    """Upcoming in-person conferences with student funding only."""
    if is_online_conference(conference):
        return False
    if is_past_conference(conference):
        return False
    return has_student_funding(conference)


def passes_default_feed(
    conference: Conference,
    *,
    include_unknown_locations: bool = False,
    include_non_us: bool = False,
    include_not_eligible: bool = False,
) -> bool:
    if not should_persist_conference(conference):
        return False
    allowed = {LocationStatus.US}
    if include_unknown_locations:
        allowed.add(LocationStatus.UNKNOWN)
    if include_non_us:
        allowed.add(LocationStatus.NON_US)
    if conference.location_status not in allowed:
        return False
    if (
        not include_not_eligible
        and conference.eligibility_status == EligibilityStatus.NOT_ELIGIBLE
    ):
        return False
    return True
