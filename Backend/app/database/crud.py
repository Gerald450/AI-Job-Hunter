from datetime import datetime, timezone
from operator import index
from textwrap import indent

from database.jobmodel import JobModel
from model.job import Job
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session


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
