import re
from datetime import datetime, timezone

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


def get_jobs(
    db: Session,
    *,
    sponsoring_only: bool = True,
    exclude_closed: bool = True,
    exclude_advanced_degree: bool = True,
    exclude_internships: bool = True,
) -> list[JobModel]:
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

    jobs = query.all()
    jobs.sort(key=lambda job: (age_to_hours(job.age), job.company, job.role))
    return jobs


def insert_jobs(db: Session, jobs: list[Job]) -> None:

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
        },
    )

    db.execute(stmt)
    db.commit()
