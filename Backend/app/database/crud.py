from database.jobmodel import JobModel
from model.job import Job
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session


def insert_jobs(db: Session, jobs: list[Job]) -> None:

    db_jobs = [JobModel.from_job(job) for job in jobs]

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
        }
        for job in db_jobs
    ]

    stmt = (
        insert(JobModel)
        .values(rows)
        .on_conflict_do_nothing(index_elements=["fingerprint"])
    )
    db.execute(stmt)

    db.commit()
