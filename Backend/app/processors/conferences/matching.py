"""Explainable 0–100 conference match score. Not prestige-based."""

from __future__ import annotations

from datetime import date
from typing import Any, Optional

from model.conference import (
    Conference,
    EligibilityStatus,
    FundingStatus,
    LocationStatus,
    MatchReason,
)
from processors.conferences.dates import days_until, soonest_future
from processors.conferences.topics import classify_topics


def score_conference(
    conference: Conference,
    profile: dict[str, Any],
    *,
    today: Optional[date] = None,
) -> Conference:
    weights = profile.get("match_weights") or {}
    reasons: list[MatchReason] = []
    total = 0

    topic_cap = int(weights.get("topic_alignment", 35))
    topics = conference.topics or classify_topics(
        conference.name, conference.description, conference.conference_type
    )
    if not conference.topics:
        conference.topics = topics
    topic_points = min(topic_cap, len(topics) * max(topic_cap // 4, 5))
    if topics:
        reasons.append(
            MatchReason(
                factor="topic_alignment",
                points=topic_points,
                why=f"Matched topics: {', '.join(topics)}",
            )
        )
    else:
        reasons.append(
            MatchReason(
                factor="topic_alignment",
                points=0,
                why="No CS/SWE/AI/math topic keywords found",
            )
        )
    total += topic_points

    under_cap = int(weights.get("undergraduate_eligible", 15))
    if conference.undergraduate_eligible is True or (
        conference.eligibility_status == EligibilityStatus.ELIGIBLE
    ):
        under_points = under_cap
        why = "Undergraduate eligibility is explicitly satisfied"
    elif conference.eligibility_status == EligibilityStatus.LIKELY_ELIGIBLE:
        under_points = int(under_cap * 0.7)
        why = "Known requirements pass; some details unresolved"
    elif conference.eligibility_status == EligibilityStatus.NEEDS_VERIFICATION:
        under_points = int(under_cap * 0.35)
        why = "Undergraduate eligibility needs verification"
    else:
        under_points = 0
        why = "Not eligible as an undergraduate"
    reasons.append(
        MatchReason(factor="undergraduate_eligible", points=under_points, why=why)
    )
    total += under_points

    loc_cap = int(weights.get("us_or_virtual", 15))
    if conference.location_status == LocationStatus.US:
        loc_points = loc_cap
        why = "Physically located in the United States"
    elif conference.location_status == LocationStatus.VIRTUAL:
        loc_points = int(loc_cap * 0.8)
        why = "Virtual conference accessible from the U.S."
    else:
        loc_points = 0
        why = f"Location status is {conference.location_status.value}"
    reasons.append(MatchReason(factor="us_or_virtual", points=loc_points, why=why))
    total += loc_points

    fund_cap = int(weights.get("student_funding", 15))
    if conference.funding_status == FundingStatus.FUNDING_AVAILABLE or (
        conference.funding_available is True
    ):
        fund_points = fund_cap
        why = "Student funding (grant/waiver/scholarship) found for this conference"
    elif conference.funding_status == FundingStatus.NO_FUNDING_FOUND:
        fund_points = 0
        why = "Official page checked; no student funding found"
    else:
        fund_points = 0
        why = "Student funding unknown (not verified)"
    reasons.append(MatchReason(factor="student_funding", points=fund_points, why=why))
    total += fund_points

    fund_elig_cap = int(weights.get("funding_likely_eligible", 10))
    if conference.funding_eligibility_status in (
        EligibilityStatus.ELIGIBLE,
        EligibilityStatus.LIKELY_ELIGIBLE,
    ) and conference.funding:
        elig_points = fund_elig_cap
        why = f"Funding eligibility: {conference.funding_eligibility_status.value}"
    else:
        elig_points = 0
        why = (
            "Funding eligibility is "
            f"{conference.funding_eligibility_status.value}"
        )
    reasons.append(
        MatchReason(factor="funding_likely_eligible", points=elig_points, why=why)
    )
    total += elig_points

    deadline_cap = int(weights.get("deadline_urgency", 10))
    current = today or date.today()
    soonest = soonest_future(
        [
            conference.call_for_papers_deadline,
            conference.paper_submission_deadline,
            conference.abstract_deadline,
            conference.registration_deadline,
            conference.student_registration_deadline,
            conference.funding_deadline,
            conference.application_deadline,
            *[d.deadline_at for d in conference.deadlines],
        ],
        today=current,
    )
    delta = days_until(soonest, today=current)
    if delta is None:
        dl_points = 3
        why = "No dated deadline is known"
    elif delta <= 14:
        dl_points = deadline_cap
        why = f"Deadline in {delta} day(s)"
    elif delta <= 45:
        dl_points = int(deadline_cap * 0.7)
        why = f"Deadline in {delta} day(s)"
    elif delta <= 90:
        dl_points = int(deadline_cap * 0.4)
        why = f"Deadline in {delta} day(s)"
    else:
        dl_points = 2
        why = f"Deadline in {delta} day(s)"
    reasons.append(
        MatchReason(factor="deadline_urgency", points=dl_points, why=why)
    )
    total += dl_points

    conference.match_score = max(0, min(100, total))
    conference.match_reasons = reasons
    return conference
