import uuid
from datetime import datetime, timezone
from typing import List, Optional, Tuple

from database.jobmodel import JobModel
from model.job import Job
from processors.age import age_to_hours as parse_age_hours
from processors.age import is_within_max_age, load_max_age_days
from processors.company_filter import is_excluded_company
from processors.experience import load_max_years_experience
from sqlalchemy import not_, or_, text
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
    exclude_citizenship_required: bool = True,
    exclude_experienced: bool = True,
    exclude_flagged: bool = True,
    exclude_saved: bool = True,
    active_only: bool = True,
):
    query = db.query(JobModel)

    if active_only:
        query = query.filter(JobModel.is_active.is_(True))

    if sponsoring_only:
        query = query.filter(JobModel.no_sponsorship.is_(False))

    if exclude_citizenship_required:
        query = query.filter(JobModel.citizenship_required.is_(False))

    if exclude_experienced:
        max_years = load_max_years_experience()
        query = query.filter(
            or_(
                JobModel.min_years_required.is_(None),
                JobModel.min_years_required <= max_years,
            )
        )

    if exclude_flagged:
        query = query.filter(JobModel.flagged.is_(False))

    if exclude_saved:
        query = query.filter(JobModel.saved.is_(False))

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


def _without_excluded_companies(jobs: List[JobModel]) -> List[JobModel]:
    return [job for job in jobs if not is_excluded_company(job.company)]


def get_job_stats(
    db: Session,
    *,
    sponsoring_only: bool = True,
    exclude_closed: bool = True,
    exclude_advanced_degree: bool = True,
    exclude_internships: bool = True,
    exclude_citizenship_required: bool = True,
    exclude_experienced: bool = True,
    exclude_flagged: bool = True,
    exclude_saved: bool = True,
) -> dict:
    query = _base_jobs_query(
        db,
        sponsoring_only=sponsoring_only,
        exclude_closed=exclude_closed,
        exclude_advanced_degree=exclude_advanced_degree,
        exclude_internships=exclude_internships,
        exclude_citizenship_required=exclude_citizenship_required,
        exclude_experienced=exclude_experienced,
        exclude_flagged=exclude_flagged,
        exclude_saved=exclude_saved,
    )
    jobs = _without_excluded_companies(query.all())
    total = len(jobs)
    applied = sum(1 for job in jobs if job.applied)
    saved_rows = _without_excluded_companies(
        db.query(JobModel)
        .filter(
            JobModel.is_active.is_(True),
            JobModel.saved.is_(True),
            JobModel.flagged.is_(False),
        )
        .all()
    )
    flagged_rows = _without_excluded_companies(
        db.query(JobModel)
        .filter(JobModel.is_active.is_(True), JobModel.flagged.is_(True))
        .all()
    )
    return {
        "total": total,
        "applied": applied,
        "remaining": total - applied,
        "saved": len(saved_rows),
        "flagged": len(flagged_rows),
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
    exclude_citizenship_required: bool = True,
    exclude_experienced: bool = True,
    exclude_flagged: bool = True,
    exclude_saved: bool = True,
    applied: Optional[bool] = None,
    saved: Optional[bool] = None,
    flagged: Optional[bool] = None,
    company: Optional[str] = None,
    source: Optional[str] = None,
    max_age: Optional[str] = None,
    limit: int = 25,
    offset: int = 0,
) -> Tuple[List[JobModel], int]:
    # Saved / flagged tabs: include those rows; flagged also skips sponsorship
    # gates so manually hidden roles remain reviewable.
    if saved is True:
        exclude_saved = False
    if flagged is True:
        exclude_flagged = False
        exclude_saved = False
        sponsoring_only = False
        exclude_citizenship_required = False
        exclude_experienced = False

    query = _base_jobs_query(
        db,
        sponsoring_only=sponsoring_only,
        exclude_closed=exclude_closed,
        exclude_advanced_degree=exclude_advanced_degree,
        exclude_internships=exclude_internships,
        exclude_citizenship_required=exclude_citizenship_required,
        exclude_experienced=exclude_experienced,
        exclude_flagged=exclude_flagged,
        exclude_saved=exclude_saved,
    )

    if applied is not None:
        query = query.filter(JobModel.applied.is_(applied))

    if saved is not None:
        query = query.filter(JobModel.saved.is_(saved))

    if flagged is not None:
        query = query.filter(JobModel.flagged.is_(flagged))

    company_query = (company or "").strip()
    if company_query:
        query = query.filter(JobModel.company.ilike(f"%{company_query}%"))

    jobs = _without_excluded_companies(query.all())

    source_query = (source or "").strip()
    if source_query:
        jobs = [job for job in jobs if _matches_source(job, source_query)]

    max_age_query = (max_age or "").strip()
    if max_age_query:
        max_hours = age_to_hours(max_age_query)
        jobs = [job for job in jobs if age_to_hours(job.age) <= max_hours]

    epoch = datetime.min.replace(tzinfo=timezone.utc)
    if applied is True:
        # Recently applied first (applied_at); fall back to updated_at for legacy rows.
        jobs.sort(
            key=lambda job: job.applied_at or job.updated_at or epoch,
            reverse=True,
        )
    elif saved is True:
        jobs.sort(
            key=lambda job: job.saved_at or job.updated_at or epoch,
            reverse=True,
        )
    elif flagged is True:
        jobs.sort(
            key=lambda job: job.flagged_at or job.updated_at or epoch,
            reverse=True,
        )
    else:
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
        saved=False,
        flagged=False,
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

    now = datetime.now(timezone.utc)
    job.applied = applied
    job.applied_at = now if applied else None
    job.updated_at = now
    db.commit()
    db.refresh(job)
    return job


def set_job_saved(
    db: Session, job_id: uuid.UUID, saved: bool
) -> Optional[JobModel]:
    job = get_job_by_id(db, job_id)
    if job is None:
        return None

    now = datetime.now(timezone.utc)
    job.saved = saved
    job.saved_at = now if saved else None
    job.updated_at = now
    db.commit()
    db.refresh(job)
    return job


def set_job_flagged(
    db: Session, job_id: uuid.UUID, flagged: bool
) -> Optional[JobModel]:
    job = get_job_by_id(db, job_id)
    if job is None:
        return None

    now = datetime.now(timezone.utc)
    job.flagged = flagged
    job.flagged_at = now if flagged else None
    job.updated_at = now
    db.commit()
    db.refresh(job)
    return job


def delete_job(db: Session, job_id: uuid.UUID) -> bool:
    """Hard-delete a job by id. Related analyses cascade via FK."""
    job = get_job_by_id(db, job_id)
    if job is None:
        return False
    db.delete(job)
    db.commit()
    return True


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
            "min_years_required": job.min_years_required,
            "applied": False,
            "saved": False,
            "flagged": False,
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
            "apply_url": stmt.excluded.apply_url,
            # Keep True once set (list emoji or description enrich) so re-ingest
            # does not wipe citizenship / no-sponsor flags discovered later.
            "no_sponsorship": text(
                "jobs.no_sponsorship OR EXCLUDED.no_sponsorship"
            ),
            "citizenship_required": text(
                "jobs.citizenship_required OR EXCLUDED.citizenship_required"
            ),
            "min_years_required": text(
                """
                CASE
                  WHEN EXCLUDED.min_years_required IS NULL
                    THEN jobs.min_years_required
                  WHEN jobs.min_years_required IS NULL
                    THEN EXCLUDED.min_years_required
                  ELSE GREATEST(
                    jobs.min_years_required,
                    EXCLUDED.min_years_required
                  )
                END
                """
            ),
            "advanced_degree": stmt.excluded.advanced_degree,
            "source": stmt.excluded.source,
            "ats": stmt.excluded.ats,
            "external_id": stmt.excluded.external_id,
            "role_family": stmt.excluded.role_family,
            "is_active": stmt.excluded.is_active,
            "updated_at": now,
            # Intentionally do not overwrite `applied`, `saved`, `flagged`,
            # `description`, or description-derived sponsorship fields on
            # list-source upserts.
        },
    )

    db.execute(stmt)
    db.commit()
    return {"submitted": len(rows)}
