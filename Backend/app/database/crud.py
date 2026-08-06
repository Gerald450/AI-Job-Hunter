import re
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Tuple

from database.jobmodel import JobModel
from model.job import Job
from sqlalchemy import not_, or_
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session


def age_to_hours(age: str) -> int:
    """Convert human age strings like '2d' / '1mo' into hours for sorting."""
    match = re.fullmatch(r"(\d+)\s*([a-zA-Z]+)", (age or "").strip())
    if not match:
        return 10**9

    value = int(match.group(1))
    unit = match.group(2).lower()

    if unit.startswith("h"):
        return value
    if unit.startswith("d"):
        return value * 24
    if unit.startswith("w"):
        return value * 24 * 7
    if unit.startswith("mo"):
        return value * 24 * 30
    if unit.startswith("y"):
        return value * 24 * 365
    return 10**9


def _base_jobs_query(
    db: Session,
    *,
    sponsoring_only: bool = True,
    exclude_closed: bool = True,
    exclude_advanced_degree: bool = True,
    exclude_internships: bool = True,
):
    query = db.query(JobModel)

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


def get_jobs(
    db: Session,
    *,
    sponsoring_only: bool = True,
    exclude_closed: bool = True,
    exclude_advanced_degree: bool = True,
    exclude_internships: bool = True,
    applied: Optional[bool] = None,
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

    jobs = query.all()
    jobs.sort(key=lambda job: (age_to_hours(job.age), job.company, job.role))
    total = len(jobs)
    return jobs[offset : offset + limit], total


def get_job_by_id(db: Session, job_id: uuid.UUID) -> Optional[JobModel]:
    return db.query(JobModel).filter(JobModel.id == job_id).first()


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


def insert_jobs(db: Session, jobs: List[Job]) -> None:

    db_jobs = [JobModel.from_job(job) for job in jobs]
    now = datetime.now(timezone.utc)

    rows = [
        {
            "id": job.id,  # or job_model.id if already set
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
            "updated_at": now,
            # Intentionally do not overwrite `applied` or description-derived
            # sponsorship fields on list-source upserts.
        },
    )

    db.execute(stmt)
    db.commit()
