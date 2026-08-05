from clients.db import SessionLocal, create_database
from database.crud import get_jobs
from fastapi import Depends, FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from schemas.job import JobResponse
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


@app.get("/api/jobs", response_model=list[JobResponse])
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
    db: Session = Depends(get_db),
):
    jobs = get_jobs(
        db,
        sponsoring_only=sponsoring_only,
        exclude_closed=exclude_closed,
        exclude_advanced_degree=exclude_advanced_degree,
        exclude_internships=exclude_internships,
    )
    return jobs
