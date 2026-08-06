import uuid
from datetime import datetime, timezone
from typing import List, Optional, Tuple

from database.jobmodel import JobModel
from model.job import Job
from processors.age import age_to_hours as parse_age_hours
from processors.age import is_within_max_age, load_max_age_days
from sqlalchemy import not_, or_
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session


def age_to_hours(age: str) -> int:
    """Convert human age strings like '2d' / '1mo' into hours for sorting."""
    hours = parse_age_hours(age)
    return 10**9 if hours is None else hours


def delete_stale_jobs(
    db: Session,
    *,
    max_age_days: Optional[int] = None,
) -> int:
    """Hard-delete jobs older than ``max_age_days``.

    Uses parseable ``age`` when available; otherwise falls back to ``created_at``.
    Returns the number of rows deleted.
    """
    limit_days = load_max_age_days() if max_age_days is None else max_age_days
    jobs = db.query(JobModel).all()
    stale_ids: List[uuid.UUID] = []
    for job in jobs:
        if is_within_max_age(
            age=job.age,
            fallback_at=job.created_at,
            max_age_days=limit_days,
        ):
            continue
        stale_ids.append(job.id)

    if not stale_ids:
        return 0

    deleted = (
        db.query(JobModel)
        .filter(JobModel.id.in_(stale_ids))
        .delete(synchronize_session=False)
    )
    db.commit()
    return int(deleted)


def _base_jobs_query(
    db: Session,
    *,
    sponsoring_only: bool = True,
    exclude_closed: bool = True,
    exclude_advanced_degree: bool = True,
    exclude_internships: bool = True,
    active_only: bool = True,
):
    query = db.query(JobModel)

    if active_only:
        query = query.filter(JobModel.is_active.is_(True))

    if sponsoring_only:
        query = query.filter(JobModel.no_sponsorship.is_(False))

    if exclude_closed:
        query = query.filter(JobModel.closed.is_(False))

    if exclude_advanced_degree:
        query = query.filter(JobModel.advanced_degree.is_(False))

    if exclude_internships:
        # No job_type column yet — exclude internship-like titles.
        query = query.filter(
            not_(
                or_(
                    JobModel.role.ilike("%intern%"),
                    JobModel.role.ilike("%internship%"),
                )
            )
        )

    return query


def get_job_stats(
    db: Session,
    *,
    sponsoring_only: bool = True,
    exclude_closed: bool = True,
    exclude_advanced_degree: bool = True,
    exclude_internships: bool = True,
) -> dict:
    query = _base_jobs_query(
        db,
        sponsoring_only=sponsoring_only,
        exclude_closed=exclude_closed,
        exclude_advanced_degree=exclude_advanced_degree,
        exclude_internships=exclude_internships,
    )
    jobs = query.all()
    total = len(jobs)
    applied = sum(1 for job in jobs if job.applied)
    return {
        "total": total,
        "applied": applied,
        "remaining": total - applied,
    }


def _matches_source(job: JobModel, source: str) -> bool:
    """Match discovery source, ATS id, or common ATS tokens in the apply URL."""
    needle = source.strip().lower()
    if not needle:
        return True

    if needle in (job.source or "").lower():
        return True
    if job.ats and needle in job.ats.lower():
        return True

    url = (job.apply_url or "").lower()
    return needle in url


def get_jobs(
    db: Session,
    *,
    sponsoring_only: bool = True,
    exclude_closed: bool = True,
    exclude_advanced_degree: bool = True,
    exclude_internships: bool = True,
    applied: Optional[bool] = None,
    company: Optional[str] = None,
    source: Optional[str] = None,
    max_age: Optional[str] = None,
    limit: int = 25,
    offset: int = 0,
) -> Tuple[List[JobModel], int]:
    query = _base_jobs_query(
        db,
        sponsoring_only=sponsoring_only,
        exclude_closed=exclude_closed,
        exclude_advanced_degree=exclude_advanced_degree,
        exclude_internships=exclude_internships,
    )

    if applied is not None:
        query = query.filter(JobModel.applied.is_(applied))

    company_query = (company or "").strip()
    if company_query:
        query = query.filter(JobModel.company.ilike(f"%{company_query}%"))

    jobs = query.all()

    source_query = (source or "").strip()
    if source_query:
        jobs = [job for job in jobs if _matches_source(job, source_query)]

    max_age_query = (max_age or "").strip()
    if max_age_query:
        max_hours = age_to_hours(max_age_query)
        jobs = [job for job in jobs if age_to_hours(job.age) <= max_hours]

    jobs.sort(key=lambda job: (age_to_hours(job.age), job.company, job.role))
    total = len(jobs)
    return jobs[offset : offset + limit], total


def get_job_by_id(db: Session, job_id: uuid.UUID) -> Optional[JobModel]:
    return db.query(JobModel).filter(JobModel.id == job_id).first()


def get_job_by_apply_url(db: Session, apply_url: str) -> Optional[JobModel]:
    """Return the most recently updated job row for an apply URL (exact match)."""
    url = (apply_url or "").strip()
    if not url:
        return None
    return (
        db.query(JobModel)
        .filter(JobModel.apply_url == url)
        .order_by(JobModel.updated_at.desc())
        .first()
    )


def create_extension_job(
    db: Session,
    *,
    apply_url: str,
    company: str,
    role: str,
    location: str,
    ats: Optional[str] = None,
    description: Optional[str] = None,
) -> JobModel:
    """Insert a lightweight job row sourced from the Chrome extension."""
    from utils.fingerprint import create_fingerprint

    fingerprint = create_fingerprint(
        {
            "company": company,
            "role": role,
            "location": location,
            "apply_url": apply_url,
        }
    )
    existing = (
        db.query(JobModel).filter(JobModel.fingerprint == fingerprint).first()
    )
    if existing is not None:
        return existing

    now = datetime.now(timezone.utc)
    row = JobModel(
        id=uuid.uuid4(),
        company=company,
        role=role,
        location=location or "Unknown",
        apply_url=apply_url,
        age="0d",
        fingerprint=fingerprint,
        source="extension",
        faang=False,
        no_sponsorship=False,
        citizenship_required=False,
        advanced_degree=False,
        closed=False,
        applied=False,
        ats=ats if ats and ats != "unknown" else None,
        is_active=True,
        description=description,
        sponsorship_confidence=0.0,
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def set_job_applied(
    db: Session, job_id: uuid.UUID, applied: bool
) -> Optional[JobModel]:
    job = get_job_by_id(db, job_id)
    if job is None:
        return None

    job.applied = applied
    job.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(job)
    return job


def insert_jobs(db: Session, jobs: List[Job]) -> dict:
    """Upsert jobs by fingerprint. Returns insert/update oriented counts."""
    if not jobs:
        return {"submitted": 0}

    db_jobs = [JobModel.from_job(job) for job in jobs]
    now = datetime.now(timezone.utc)

    rows = [
        {
            "id": job.id,
            "company": job.company,
            "role": job.role,
            "location": job.location,
            "apply_url": job.apply_url,
            "age": job.age,
            "fingerprint": job.fingerprint,
            "source": job.source,
            "faang": job.faang,
            "no_sponsorship": job.no_sponsorship,
            "citizenship_required": job.citizenship_required,
            "advanced_degree": job.advanced_degree,
            "closed": job.closed,
            "applied": False,
            "ats": job.ats,
            "external_id": job.external_id,
            "role_family": job.role_family,
            "is_active": job.is_active,
            "description": job.description,
            "sponsorship_available": job.sponsorship_available,
            "sponsorship_match": job.sponsorship_match,
            "sponsorship_confidence": job.sponsorship_confidence,
            "created_at": now,
            "updated_at": now,
        }
        for job in db_jobs
    ]

    stmt = insert(JobModel).values(rows)

    stmt = stmt.on_conflict_do_update(
        index_elements=["fingerprint"],
        set_={
            "age": stmt.excluded.age,
            "closed": stmt.excluded.closed,
            "faang": stmt.excluded.faang,
            "no_sponsorship": stmt.excluded.no_sponsorship,
            "citizenship_required": stmt.excluded.citizenship_required,
            "advanced_degree": stmt.excluded.advanced_degree,
            "source": stmt.excluded.source,
            "ats": stmt.excluded.ats,
            "external_id": stmt.excluded.external_id,
            "role_family": stmt.excluded.role_family,
            "is_active": stmt.excluded.is_active,
            "updated_at": now,
            # Intentionally do not overwrite `applied`, `description`, or
            # description-derived sponsorship fields on list-source upserts.
        },
    )

    db.execute(stmt)
    db.commit()
    return {"submitted": len(rows)}
