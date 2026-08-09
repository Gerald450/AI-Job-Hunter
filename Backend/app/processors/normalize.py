"""Normalize raw job dicts into the shared ``Job`` model."""

from __future__ import annotations

from typing import Any

from model.job import Job
from processors.apply_url import rewrite_apply_url
from processors.company_filter import is_excluded_company
from processors.experience import extract_min_years_required
from sponsorship.detector import SponsorshipDetector, detect_citizenship_required
from utils.fingerprint import create_fingerprint

# Emoji markers used by PittCSC / SimplifyJobs READMEs.
FAANG = "🔥"
NO_SPONSOR = "🛂"
US_CITIZEN = "🇺🇸"
CLOSED = "🔒"
ADVANCED = "🎓"

_detector = SponsorshipDetector()


def infer_no_sponsorship(text: str) -> bool:
    """Return True only when ``text`` explicitly denies sponsorship."""
    if not text:
        return False
    if NO_SPONSOR in text:
        return True
    return _detector.detect(text).sponsorship is False


def infer_citizenship_required(text: str) -> bool:
    """Return True when text explicitly requires US citizenship."""
    if not text:
        return False
    if US_CITIZEN in text:
        return True
    return detect_citizenship_required(text) is not None


def normalize_job(job: dict[str, Any]) -> Job:
    """Convert a raw parser dict into a fingerprintable ``Job``."""
    normalized = dict(job)

    company = str(normalized.get("company") or "")
    role = str(normalized.get("role") or "")
    notes = str(normalized.get("notes") or "")
    location = str(normalized.get("location") or "")
    description = str(normalized.get("description") or "")

    normalized["faang"] = FAANG in company
    normalized["closed"] = CLOSED in role or CLOSED in notes
    normalized["advanced_degree"] = ADVANCED in role or ADVANCED in notes

    text_blob = f"{role} {notes} {location} {description}"
    citizenship = infer_citizenship_required(text_blob)
    normalized["citizenship_required"] = citizenship
    normalized["min_years_required"] = extract_min_years_required(text_blob)

    normalized["no_sponsorship"] = (
        bool(normalized.get("_text_no_sponsorship"))
        or infer_no_sponsorship(text_blob)
        or citizenship
    )

    for marker in [FAANG, NO_SPONSOR, US_CITIZEN, CLOSED, ADVANCED]:
        company = company.replace(marker, "")
        role = role.replace(marker, "")
        notes = notes.replace(marker, "")

    normalized["company"] = company.strip()
    normalized["role"] = role.strip()
    normalized["location"] = location.strip() or "Unknown"
    normalized["notes"] = notes.strip()

    if is_excluded_company(normalized["company"]):
        normalized["no_sponsorship"] = True

    normalized["fingerprint"] = create_fingerprint(normalized)

    apply_url = normalized.get("apply_url")
    if not apply_url or not isinstance(apply_url, str):
        raise ValueError("Job is missing apply_url")

    apply_url = rewrite_apply_url(
        apply_url,
        role=normalized["role"],
        external_id=(
            str(normalized["external_id"])
            if normalized.get("external_id") is not None
            else None
        ),
    )
    normalized["apply_url"] = apply_url

    ats = normalized.get("ats")
    external_id = normalized.get("external_id")
    role_family = normalized.get("role_family")

    return Job(
        company=normalized["company"],
        role=normalized["role"],
        location=normalized["location"],
        apply_url=apply_url,
        age=str(normalized.get("age") or "unknown"),
        fingerprint=normalized["fingerprint"],
        source=str(normalized.get("source") or "unknown"),
        faang=bool(normalized["faang"]),
        no_sponsorship=bool(normalized["no_sponsorship"]),
        citizenship_required=bool(normalized["citizenship_required"]),
        closed=bool(normalized["closed"]),
        advanced_degree=bool(normalized["advanced_degree"]),
        min_years_required=normalized.get("min_years_required"),
        ats=str(ats) if ats else None,
        external_id=str(external_id) if external_id else None,
        role_family=str(role_family) if role_family else None,
        is_active=bool(normalized.get("is_active", True)),
        description=str(description) if description else None,
    )
