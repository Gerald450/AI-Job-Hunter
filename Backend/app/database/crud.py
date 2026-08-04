from database.jobmodel import JobModel
from model.job import Job
from sqlalchemy.orm import Session


def insert_jobs(db: Session, jobs: list[Job]) -> None:

    db_jobs = [JobModel.from_job(job) for job in jobs]

    db.add_all(db_jobs)

    db.commit()
