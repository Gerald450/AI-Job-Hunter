"""Build typed deadline rows from conference date fields."""

from __future__ import annotations

from datetime import date
from typing import Optional

from model.conference import ConferenceDeadline, DeadlineKind
from processors.conferences.dates import is_rolling


def collect_deadlines(
    *,
    call_for_papers_deadline: Optional[date] = None,
    paper_submission_deadline: Optional[date] = None,
    abstract_deadline: Optional[date] = None,
    registration_deadline: Optional[date] = None,
    student_registration_deadline: Optional[date] = None,
    funding_deadline: Optional[date] = None,
    application_deadline: Optional[date] = None,
    extra_text: Optional[str] = None,
    source_url: Optional[str] = None,
) -> list[ConferenceDeadline]:
    rows: list[ConferenceDeadline] = []
    mapping = (
        (DeadlineKind.CFP, call_for_papers_deadline),
        (DeadlineKind.PAPER, paper_submission_deadline),
        (DeadlineKind.ABSTRACT, abstract_deadline),
        (DeadlineKind.REGISTRATION, registration_deadline),
        (DeadlineKind.STUDENT_REGISTRATION, student_registration_deadline),
        (DeadlineKind.TRAVEL_GRANT, funding_deadline),
        (DeadlineKind.APPLICATION, application_deadline),
    )
    for kind, value in mapping:
        if value is None:
            continue
        rows.append(
            ConferenceDeadline(
                kind=kind,
                deadline_at=value,
                is_rolling=False,
                is_unknown=False,
                source_url=source_url,
            )
        )
    if extra_text and is_rolling(extra_text) and not rows:
        rows.append(
            ConferenceDeadline(
                kind=DeadlineKind.ROLLING,
                deadline_at=None,
                is_rolling=True,
                is_unknown=False,
                source_url=source_url,
            )
        )
    return rows
