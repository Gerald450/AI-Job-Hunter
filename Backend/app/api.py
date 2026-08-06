import uuid
from typing import Optional

from clients.db import SessionLocal, create_database
from database.crud import get_job_stats, get_jobs, set_job_applied
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from schemas.job import AppliedUpdate, JobListResponse, JobResponse, JobStats
from sqlalchemy.orm import Session

app = FastAPI(title="AI Job Hunter API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.on_event("startup")
def on_startup():
    create_database()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/jobs", response_model=JobListResponse)
def list_jobs(
    sponsoring_only: bool = Query(
        True, description="Only jobs where no_sponsorship is false"
    ),
    exclude_closed: bool = Query(True, description="Exclude closed roles"),
    exclude_advanced_degree: bool = Query(
        True, description="Exclude master's / advanced-degree roles"
    ),
    exclude_internships: bool = Query(
        True, description="Exclude roles whose title looks like an internship"
    ),
    applied: Optional[bool] = Query(
        None,
        description="Filter by applied status. Omit for all jobs.",
    ),
    limit: int = Query(25, ge=1, le=100, description="Page size"),
    offset: int = Query(0, ge=0, description="Number of jobs to skip"),
    db: Session = Depends(get_db),
):
    jobs, total = get_jobs(
        db,
        sponsoring_only=sponsoring_only,
        exclude_closed=exclude_closed,
        exclude_advanced_degree=exclude_advanced_degree,
        exclude_internships=exclude_internships,
        applied=applied,
        limit=limit,
        offset=offset,
    )
    stats = get_job_stats(
        db,
        sponsoring_only=sponsoring_only,
        exclude_closed=exclude_closed,
        exclude_advanced_degree=exclude_advanced_degree,
        exclude_internships=exclude_internships,
    )
    return JobListResponse(
        jobs=jobs,
        total=total,
        has_more=offset + len(jobs) < total,
        stats=JobStats(**stats),
    )


@app.patch("/api/jobs/{job_id}/applied", response_model=JobResponse)
def update_job_applied(
    job_id: uuid.UUID,
    body: AppliedUpdate,
    db: Session = Depends(get_db),
):
    job = set_job_applied(db, job_id, body.applied)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job
