"""Deduplicate and merge conference records across sources."""

from __future__ import annotations

from typing import Optional

from model.conference import Conference, ConferenceSourceRef
from processors.conferences.names import (
    is_official_source,
    normalize_conference_name,
    normalize_org,
    prefer_text,
    source_rank,
)
from utils.fingerprint import canonicalize_url, create_conference_fingerprint


def dedupe_key(conference: Conference) -> str:
    url = canonicalize_url(conference.official_url)
    if url:
        return f"url:{url}"
    name = normalize_conference_name(conference.name)
    org = normalize_org(conference.organization)
    start = conference.start_date.isoformat() if conference.start_date else ""
    city = (conference.city or "").strip().lower()
    return f"meta:{name}|{org}|{start}|{city}"


def merge_conferences(left: Conference, right: Conference) -> Conference:
    """Merge two records of the same event. Official facts win."""
    primary, secondary = (
        (left, right)
        if source_rank(left.source) <= source_rank(right.source)
        else (right, left)
    )
    winner_official = is_official_source(primary.source)

    def pick(attr: str):
        a = getattr(primary, attr)
        b = getattr(secondary, attr)
        if winner_official and a not in (None, "", []):
            return a
        return a if a not in (None, "", []) else b

    merged = primary.model_copy(deep=True)
    merged.name = pick("name")
    merged.organization = prefer_text(primary.organization, secondary.organization)
    merged.description = prefer_text(primary.description, secondary.description)
    merged.official_url = prefer_text(primary.official_url, secondary.official_url)
    merged.location = pick("location")
    merged.country = pick("country")
    merged.city = pick("city")
    merged.state = pick("state")
    for field in (
        "start_date",
        "end_date",
        "call_for_papers_deadline",
        "paper_submission_deadline",
        "abstract_deadline",
        "registration_deadline",
        "student_registration_deadline",
        "funding_deadline",
        "application_deadline",
        "conference_type",
        "eligibility_requirements",
        "citizenship_requirements",
        "residency_requirements",
        "application_url",
        "funding_amount",
        "funding_requirements",
    ):
        setattr(merged, field, pick(field))

    merged.topics = _unique(list(primary.topics) + list(secondary.topics))
    merged.sources = _merge_sources(primary.sources, secondary.sources)
    if is_official_source(secondary.source) and not is_official_source(primary.source):
        merged.source = secondary.source
        merged.source_url = secondary.source_url or primary.source_url
    else:
        merged.source = primary.source
        merged.source_url = primary.source_url or secondary.source_url

    if secondary.last_verified_at and (
        primary.last_verified_at is None
        or secondary.last_verified_at > primary.last_verified_at
    ):
        merged.last_verified_at = secondary.last_verified_at

    if secondary.funding and (winner_official is False or not primary.funding):
        if is_official_source(secondary.source) or not primary.funding:
            merged.funding = secondary.funding
    if secondary.deadlines and (not primary.deadlines or is_official_source(secondary.source)):
        if is_official_source(secondary.source) or not primary.deadlines:
            merged.deadlines = secondary.deadlines

    merged.fingerprint = create_conference_fingerprint(
        name=merged.name,
        organization=merged.organization,
        start_date=merged.start_date,
        city=merged.city,
        official_url=merged.official_url,
    )
    return merged


def deduplicate(conferences: list[Conference]) -> tuple[list[Conference], int]:
    by_url: dict[str, Conference] = {}
    by_meta: dict[str, Conference] = {}
    dupes = 0

    def _store(conference: Conference) -> None:
        nonlocal dupes
        url = canonicalize_url(conference.official_url)
        meta = _name_date_key(conference)
        existing = None
        existing_key: tuple[str, str] | None = None
        if url and url in by_url:
            existing = by_url[url]
            existing_key = ("url", url)
        elif meta and meta in by_meta:
            existing = by_meta[meta]
            existing_key = ("meta", meta)
        if existing is None:
            if url:
                by_url[url] = conference
            if meta:
                by_meta[meta] = conference
            return
        merged = merge_conferences(existing, conference)
        dupes += 1
        if existing_key and existing_key[0] == "url":
            by_url[existing_key[1]] = merged
        if existing_key and existing_key[0] == "meta":
            by_meta[existing_key[1]] = merged
        new_url = canonicalize_url(merged.official_url)
        new_meta = _name_date_key(merged)
        if new_url:
            by_url[new_url] = merged
        if new_meta:
            by_meta[new_meta] = merged
        for mapping in (by_url, by_meta):
            for key, value in list(mapping.items()):
                if value is existing:
                    mapping[key] = merged

    for conference in conferences:
        _store(conference)

    unique: list[Conference] = []
    seen: set[int] = set()
    for conference in list(by_url.values()) + list(by_meta.values()):
        marker = id(conference)
        if marker in seen:
            continue
        seen.add(marker)
        unique.append(conference)
    return unique, dupes


def _name_date_key(conference: Conference) -> Optional[str]:
    name = normalize_conference_name(conference.name)
    start = conference.start_date.isoformat() if conference.start_date else ""
    if not name:
        return None
    return f"meta:{name}|{normalize_org(conference.organization)}|{start}|{(conference.city or '').strip().lower()}"


def _merge_sources(
    left: list[ConferenceSourceRef],
    right: list[ConferenceSourceRef],
) -> list[ConferenceSourceRef]:
    seen: set[tuple[str, str]] = set()
    out: list[ConferenceSourceRef] = []
    for item in list(left) + list(right):
        key = (item.source, item.source_url or "")
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def _unique(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out
