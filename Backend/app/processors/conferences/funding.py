"""Pattern-based student-funding extraction from official page text."""

from __future__ import annotations

import re
from datetime import date
from typing import Optional

from model.conference import ConferenceFunding, EligibilityStatus, FundingKind
from processors.conferences.dates import parse_date_range

# Student support — not corporate "sponsored by Acme".
_TRAVEL_GRANT_RE = re.compile(
    r"(student\s+travel\s+grant|travel\s+grant|travel\s+award|"
    r"student\s+travel\s+award|attendance\s+grant|travel\s+reimbursement|"
    r"airfare|hotel(?:/accommodation)?\s+support)",
    re.IGNORECASE,
)
_WAIVER_RE = re.compile(
    r"(registration\s+waiver|registration\s+grant|complimentary\s+registration|"
    r"registration\s+scholarship|fee\s+waiver)",
    re.IGNORECASE,
)
_SCHOLARSHIP_RE = re.compile(
    r"(student\s+scholarship|conference\s+scholarship|student\s+sponsor(?!ed\s+by)|"
    r"financial\s+assistance|diversity\s+grant)",
    re.IGNORECASE,
)
_CORPORATE_SPONSOR_RE = re.compile(
    r"(sponsored\s+by|gold\s+sponsor|silver\s+sponsor|platinum\s+sponsor|"
    r"corporate\s+sponsor)",
    re.IGNORECASE,
)
_AMOUNT_RE = re.compile(r"\$\s?(\d{1,3}(?:,\d{3})+|\d{2,6})")
_DEADLINE_LINE_RE = re.compile(
    r"(application|grant|scholarship|travel)\s+deadline[:\s]+(.+)",
    re.IGNORECASE,
)
_PAPER_RE = re.compile(
    r"(accepted\s+paper|presenting\s+a\s+paper|must\s+present|"
    r"paper\s+authors?\s+only|author\s+of\s+an\s+accepted)",
    re.IGNORECASE,
)
_UNDERGRAD_RE = re.compile(
    r"(undergraduate|bachelor'?s?)",
    re.IGNORECASE,
)
_GRAD_ONLY_RE = re.compile(
    r"(graduate\s+students?\s+only|must\s+be\s+a\s+graduate|"
    r"ph\.?d\.?\s+students?\s+only|master'?s?\s+students?\s+only)",
    re.IGNORECASE,
)


def looks_like_student_funding(text: str | None) -> bool:
    if not text:
        return False
    if _TRAVEL_GRANT_RE.search(text) or _WAIVER_RE.search(text) or _SCHOLARSHIP_RE.search(text):
        return True
    return False


def extract_funding(
    text: str | None,
    *,
    conference_name: str,
    source_url: Optional[str] = None,
) -> list[ConferenceFunding]:
    """Extract student funding offers from official page text.

    Corporate sponsorship lines are ignored. Amounts and deadlines are kept
    only when explicitly present.
    """
    if not text or not text.strip():
        return []
    grants: list[ConferenceFunding] = []
    seen: set[str] = set()

    for pattern, kind, label in (
        (_TRAVEL_GRANT_RE, FundingKind.TRAVEL_GRANT, "Student Travel Grant"),
        (_WAIVER_RE, FundingKind.REGISTRATION_WAIVER, "Registration Waiver"),
        (_SCHOLARSHIP_RE, FundingKind.SCHOLARSHIP, "Student Scholarship"),
    ):
        match = pattern.search(text)
        if not match:
            continue
        snippet = _window(text, match.start(), match.end())
        if _CORPORATE_SPONSOR_RE.search(snippet) and not looks_like_student_funding(snippet):
            continue
        key = kind.value
        if key in seen:
            continue
        seen.add(key)
        amount = _first_amount(snippet) or _first_amount(text)
        deadline = _first_deadline(snippet) or _first_deadline(text)
        paper_required = bool(_PAPER_RE.search(snippet) or _PAPER_RE.search(text))
        undergrad: Optional[bool]
        if _GRAD_ONLY_RE.search(snippet) or _GRAD_ONLY_RE.search(text):
            undergrad = False
        elif _UNDERGRAD_RE.search(snippet) or _UNDERGRAD_RE.search(text):
            undergrad = True
        else:
            undergrad = None
        grants.append(
            ConferenceFunding(
                name=f"{conference_name} {label}",
                kind=kind,
                amount=amount,
                deadline=deadline,
                application_url=source_url,
                requirements_text=snippet.strip() or None,
                undergraduate_eligible=undergrad,
                paper_required=paper_required if paper_required else None,
                citizenship_requirements=None,
                eligibility_status=EligibilityStatus.NEEDS_VERIFICATION,
                source_url=source_url,
            )
        )
    return grants


def summarize_funding(grants: list[ConferenceFunding]) -> dict:
    travel = any(g.kind == FundingKind.TRAVEL_GRANT for g in grants)
    waiver = any(g.kind == FundingKind.REGISTRATION_WAIVER for g in grants)
    scholarship = any(g.kind == FundingKind.SCHOLARSHIP for g in grants)
    amounts = [g.amount for g in grants if g.amount]
    deadlines = [g.deadline for g in grants if g.deadline]
    reqs = [g.requirements_text for g in grants if g.requirements_text]
    return {
        "funding_available": True if grants else None,
        "travel_grant_available": travel if grants else None,
        "registration_waiver_available": waiver if grants else None,
        "scholarship_available": scholarship if grants else None,
        "funding_amount": amounts[0] if amounts else None,
        "funding_deadline": min(deadlines) if deadlines else None,
        "funding_requirements": " | ".join(reqs) if reqs else None,
    }


def _window(text: str, start: int, end: int, radius: int = 280) -> str:
    left = max(0, start - radius)
    right = min(len(text), end + radius)
    return re.sub(r"\s+", " ", text[left:right]).strip()


def _first_amount(text: str) -> Optional[str]:
    match = _AMOUNT_RE.search(text)
    if not match:
        return None
    return f"${match.group(1)}"


def _first_deadline(text: str) -> Optional[date]:
    match = _DEADLINE_LINE_RE.search(text)
    blob = match.group(2) if match else text
    start, _ = parse_date_range(blob)
    return start
