"""Deterministic conference and funding eligibility (no LLM, no invented facts)."""

from __future__ import annotations

import re
from datetime import date
from typing import Any, Optional

from model.conference import (
    Conference,
    ConferenceFunding,
    EligibilityStatus,
    LocationStatus,
)

_US_CITIZEN_RE = re.compile(
    r"(u\.?s\.?\s+citizenship\s+required|"
    r"us\s+citizenship\s+required|"
    r"united\s+states\s+citizenship\s+required|"
    r"requires?\s+u\.?s\.?\s+citizenship|"
    r"requires?\s+us\s+citizenship|"
    r"must\s+be\s+(?:a\s+)?u\.?s\.?\s+citizen|"
    r"must\s+be\s+(?:a\s+)?us\s+citizen|"
    r"must\s+be\s+(?:a\s+)?united\s+states\s+citizen|"
    r"u\.?s\.?\s+citizens?\s+only|"
    r"us\s+citizens?\s+only|"
    r"only\s+u\.?s\.?\s+citizens?|"
    r"only\s+us\s+citizens?)",
    re.IGNORECASE,
)
_US_PR_RE = re.compile(
    r"(permanent\s+residenc(?:y|e)\s+required|"
    r"must\s+be\s+(?:a\s+)?u\.?s\.?\s+permanent\s+resident|"
    r"must\s+be\s+(?:a\s+)?us\s+permanent\s+resident|"
    r"green\s+card\s+required)",
    re.IGNORECASE,
)
_OPEN_CITIZENSHIP_RE = re.compile(
    r"(regardless\s+of\s+citizenship|open\s+to\s+all\s+students|"
    r"no\s+citizenship\s+requirement|any\s+nationality)",
    re.IGNORECASE,
)
_OTHER_CITIZEN_RE = re.compile(
    r"must\s+be\s+(?:a\s+)?citizen\s+of\s+([A-Za-z][A-Za-z\s]+)",
    re.IGNORECASE,
)
_UNDERGRAD_RE = re.compile(
    r"(undergraduate|undergrad|bachelor'?s?\s+(?:student|program|degree))",
    re.IGNORECASE,
)
_GRAD_ONLY_RE = re.compile(
    r"(graduate\s+students?\s+only|"
    r"must\s+be\s+(?:a\s+)?graduate\s+student|"
    r"open\s+to\s+graduate\s+students\s+only|"
    r"ph\.?d\.?\s+students?\s+only|"
    r"master'?s?\s+(?:and\s+ph\.?d\.?\s+)?students?\s+only|"
    r"not\s+open\s+to\s+undergraduates)",
    re.IGNORECASE,
)
_GRAD_AND_UNDER_RE = re.compile(
    r"(undergraduate\s+and\s+graduate|graduate\s+and\s+undergraduate)",
    re.IGNORECASE,
)
_STUDENT_RE = re.compile(r"\bstudents?\b", re.IGNORECASE)
_ENROLLED_AT_EVENT_RE = re.compile(
    r"(enrolled\s+at\s+the\s+time\s+of\s+the\s+conference|"
    r"currently\s+enrolled\s+at\s+the\s+time|"
    r"must\s+be\s+enrolled\s+during\s+the\s+conference)",
    re.IGNORECASE,
)
_ENROLLED_THROUGH_RE = re.compile(
    r"enrolled\s+through\s+(20\d{2})",
    re.IGNORECASE,
)
_PAPER_RE = re.compile(
    r"(accepted\s+paper|presenting\s+accepted|must\s+present\s+a\s+paper|"
    r"paper\s+authors?\s+only)",
    re.IGNORECASE,
)


def _blob(*parts: Optional[str]) -> str:
    return " ".join(p for p in parts if p)


def evaluate_citizenship(
    text: str,
    *,
    profile_country: str = "United States",
) -> tuple[EligibilityStatus, Optional[str]]:
    """Return (status, matched requirement text)."""
    if not text.strip():
        return EligibilityStatus.ELIGIBLE, None
    us_citizen = _US_CITIZEN_RE.search(text)
    if us_citizen:
        # Profile does not include U.S. citizenship; treat as a hard fail.
        return EligibilityStatus.NOT_ELIGIBLE, us_citizen.group(0)
    other = _OTHER_CITIZEN_RE.search(text)
    if other:
        country = other.group(1).strip().lower()
        if "united states" in country or country in {"us", "u.s.", "usa"}:
            return EligibilityStatus.NOT_ELIGIBLE, other.group(0)
        if profile_country.lower() not in country:
            return EligibilityStatus.NOT_ELIGIBLE, other.group(0)
    if _OPEN_CITIZENSHIP_RE.search(text):
        return EligibilityStatus.ELIGIBLE, None
    pr_required = _US_PR_RE.search(text)
    if pr_required:
        return EligibilityStatus.NEEDS_VERIFICATION, pr_required.group(0)
    return EligibilityStatus.ELIGIBLE, None


def evaluate_undergraduate(
    text: str,
    *,
    start_date: Optional[date],
    graduation_date: date,
) -> tuple[EligibilityStatus, Optional[bool], Optional[bool], Optional[bool]]:
    """Return (status, student_eligible, undergraduate_eligible, graduate_eligible)."""
    if _GRAD_AND_UNDER_RE.search(text) or (
        _UNDERGRAD_RE.search(text) and re.search(r"\bgraduate\b", text, re.IGNORECASE)
    ):
        status = EligibilityStatus.ELIGIBLE
        under = True
        grad = True
        student = True
    elif _GRAD_ONLY_RE.search(text):
        return EligibilityStatus.NOT_ELIGIBLE, True, False, True
    elif _UNDERGRAD_RE.search(text):
        status = EligibilityStatus.ELIGIBLE
        under = True
        grad = None
        student = True
    elif _STUDENT_RE.search(text):
        status = EligibilityStatus.NEEDS_VERIFICATION
        under = None
        grad = None
        student = True
    elif not text.strip():
        return EligibilityStatus.NEEDS_VERIFICATION, None, None, None
    else:
        status = EligibilityStatus.LIKELY_ELIGIBLE
        under = None
        grad = None
        student = None

    through = _ENROLLED_THROUGH_RE.search(text)
    if through:
        year = int(through.group(1))
        if graduation_date.year < year:
            return EligibilityStatus.NOT_ELIGIBLE, student, under, grad

    if _ENROLLED_AT_EVENT_RE.search(text) and start_date is not None:
        if start_date > graduation_date:
            return EligibilityStatus.NOT_ELIGIBLE, student, under, grad

    if start_date is not None and start_date > graduation_date and under is True:
        if _ENROLLED_AT_EVENT_RE.search(text) or _UNDERGRAD_RE.search(text):
            return EligibilityStatus.NOT_ELIGIBLE, student, False, grad

    return status, student, under, grad


def evaluate_conference(
    conference: Conference,
    profile: dict[str, Any],
) -> Conference:
    """Fill eligibility statuses on ``conference`` from known text only."""
    graduation = _graduation(profile)
    text = _blob(
        conference.eligibility_requirements,
        conference.citizenship_requirements,
        conference.residency_requirements,
        conference.description,
        conference.funding_requirements,
    )
    cit_status, cit_match = evaluate_citizenship(
        text,
        profile_country=str(profile.get("country") or "United States"),
    )
    if cit_match and not conference.citizenship_requirements:
        conference.citizenship_requirements = cit_match

    under_status, student, under, grad = evaluate_undergraduate(
        text,
        start_date=conference.start_date,
        graduation_date=graduation,
    )
    conference.student_eligible = student
    conference.undergraduate_eligible = under
    conference.graduate_eligible = grad
    conference.citizenship_status = cit_status

    statuses = [cit_status, under_status]
    if EligibilityStatus.NOT_ELIGIBLE in statuses:
        conference.eligibility_status = EligibilityStatus.NOT_ELIGIBLE
    elif EligibilityStatus.NEEDS_VERIFICATION in statuses:
        conference.eligibility_status = EligibilityStatus.NEEDS_VERIFICATION
    elif not text.strip():
        conference.eligibility_status = EligibilityStatus.NEEDS_VERIFICATION
    elif under_status == EligibilityStatus.LIKELY_ELIGIBLE:
        conference.eligibility_status = EligibilityStatus.LIKELY_ELIGIBLE
    else:
        conference.eligibility_status = EligibilityStatus.ELIGIBLE

    # Location unknown is a filter concern, not a hard eligibility fail.
    if conference.location_status == LocationStatus.UNKNOWN:
        if conference.eligibility_status == EligibilityStatus.ELIGIBLE:
            conference.eligibility_status = EligibilityStatus.LIKELY_ELIGIBLE

    evaluate_funding_list(conference, profile)
    return conference


def evaluate_funding_list(
    conference: Conference,
    profile: dict[str, Any],
) -> None:
    graduation = _graduation(profile)
    has_paper = bool(profile.get("has_accepted_paper"))
    statuses: list[EligibilityStatus] = []
    for grant in conference.funding:
        grant.eligibility_status = evaluate_funding(
            grant,
            graduation_date=graduation,
            start_date=conference.start_date,
            has_accepted_paper=has_paper,
            profile_country=str(profile.get("country") or "United States"),
        )
        statuses.append(grant.eligibility_status)
    if not conference.funding:
        conference.funding_eligibility_status = EligibilityStatus.NEEDS_VERIFICATION
        return
    if EligibilityStatus.NOT_ELIGIBLE in statuses and all(
        s == EligibilityStatus.NOT_ELIGIBLE for s in statuses
    ):
        conference.funding_eligibility_status = EligibilityStatus.NOT_ELIGIBLE
    elif EligibilityStatus.ELIGIBLE in statuses:
        conference.funding_eligibility_status = EligibilityStatus.ELIGIBLE
    elif EligibilityStatus.LIKELY_ELIGIBLE in statuses:
        conference.funding_eligibility_status = EligibilityStatus.LIKELY_ELIGIBLE
    else:
        conference.funding_eligibility_status = EligibilityStatus.NEEDS_VERIFICATION


def evaluate_funding(
    grant: ConferenceFunding,
    *,
    graduation_date: date,
    start_date: Optional[date],
    has_accepted_paper: bool,
    profile_country: str,
) -> EligibilityStatus:
    text = _blob(grant.requirements_text, grant.citizenship_requirements)
    cit_status, _ = evaluate_citizenship(text, profile_country=profile_country)
    under_status, _, under, _ = evaluate_undergraduate(
        text, start_date=start_date, graduation_date=graduation_date
    )
    paper_needed = grant.paper_required is True or bool(_PAPER_RE.search(text))
    if paper_needed:
        grant.paper_required = True

    if cit_status == EligibilityStatus.NOT_ELIGIBLE:
        return EligibilityStatus.NOT_ELIGIBLE
    if under_status == EligibilityStatus.NOT_ELIGIBLE or under is False:
        return EligibilityStatus.NOT_ELIGIBLE
    if paper_needed and not has_accepted_paper:
        return EligibilityStatus.NEEDS_VERIFICATION
    if cit_status == EligibilityStatus.NEEDS_VERIFICATION:
        return EligibilityStatus.NEEDS_VERIFICATION
    if under_status == EligibilityStatus.NEEDS_VERIFICATION:
        return EligibilityStatus.NEEDS_VERIFICATION
    if not text.strip():
        return EligibilityStatus.NEEDS_VERIFICATION
    if under_status == EligibilityStatus.LIKELY_ELIGIBLE:
        return EligibilityStatus.LIKELY_ELIGIBLE
    return EligibilityStatus.ELIGIBLE


def _graduation(profile: dict[str, Any]) -> date:
    raw = profile.get("graduation_date") or "2027-05-31"
    if isinstance(raw, date):
        return raw
    return date.fromisoformat(str(raw)[:10])
