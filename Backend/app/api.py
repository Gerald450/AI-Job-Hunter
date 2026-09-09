"""FastAPI application: jobs, resumes, and on-demand resume matching."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Optional
from urllib.parse import quote

from autofill.service import AutofillService, profile_from_parsed
from clients.db import SessionLocal, create_database
from conferences_api import router as conferences_router
from database.crud import (
    delete_job,
    get_job_stats,
    get_jobs,
    set_job_applied,
    set_job_flagged,
    set_job_saved,
)
from database.resume_crud import get_match_scores_for_jobs, get_resume_row
from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from matching.service import (
    DescriptionMissingError,
    MatchingError,
    MatchingService,
    ingest_resume,
    update_job_description as persist_job_description,
)
from resumes.storage import (
    ResumeNotFoundError,
    ResumeValidationError,
    get_resume,
)
from schemas.analysis import (
    AnalysisResponse,
    AnalyzeRequest,
    BatchAnalyzeRequest,
    ExtensionJobAnalyzeRequest,
    ParsedResume,
    ResumeDetailResponse,
    SaveJobDescriptionRequest,
)
from schemas.autofill import (
    AiAutofillRequest,
    AiAutofillResponse,
    ExtensionProfileRequest,
    ExtensionUserProfile,
)
from schemas.job import (
    AppliedUpdate,
    FlaggedUpdate,
    JobListResponse,
    JobResponse,
    JobStats,
    SavedUpdate,
)
from schemas.resume import ResumeDownloadRequest, ResumeUploadResponse
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

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

BATCH_CONCURRENCY = 3

app.include_router(conferences_router)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.on_event("startup")
def on_startup():
    create_database()
    db = SessionLocal()
    try:
        from enrich import (
            rescan_citizenship_from_stored_descriptions,
            rescan_experience_from_stored_descriptions,
            rewrite_broken_apply_urls,
        )

        flagged = rescan_citizenship_from_stored_descriptions(db)
        if flagged:
            logger.info(
                "Startup citizenship backfill: flagged=%s jobs from stored JDs",
                flagged,
            )
        stamped = rescan_experience_from_stored_descriptions(db)
        if stamped:
            logger.info(
                "Startup experience backfill: stamped=%s jobs from stored JDs",
                stamped,
            )
        url_fixed = rewrite_broken_apply_urls(db)
        if url_fixed:
            logger.info(
                "Startup apply URL rewrite: fixed=%s Stripe search links",
                url_fixed,
            )
    finally:
        db.close()


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
    exclude_citizenship_required: bool = Query(
        True, description="Exclude roles that require US citizenship"
    ),
    exclude_experienced: bool = Query(
        True,
        description="Exclude roles that require more than max_years_experience (default 2)",
    ),
    applied: Optional[bool] = Query(
        None,
        description="Filter by applied status. Omit for all jobs.",
    ),
    saved: Optional[bool] = Query(
        None,
        description="Filter by saved/bookmarked status. Omit for all jobs.",
    ),
    flagged: Optional[bool] = Query(
        None,
        description="Filter by manually flagged status. Omit for all jobs.",
    ),
    company: Optional[str] = Query(
        None,
        description="Case-insensitive substring match on company name.",
    ),
    source: Optional[str] = Query(
        None,
        description="Case-insensitive match on source, ATS, or apply URL.",
    ),
    max_age: Optional[str] = Query(
        None,
        description="Only jobs at most this old (e.g. 24h, 7d, 1mo).",
    ),
    resumeId: Optional[str] = Query(
        None,
        description="When set, attach saved match_score from resume_analyses.",
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
        exclude_citizenship_required=exclude_citizenship_required,
        exclude_experienced=exclude_experienced,
        applied=applied,
        saved=saved,
        flagged=flagged,
        company=company,
        source=source,
        max_age=max_age,
        limit=limit,
        offset=offset,
    )
    stats = get_job_stats(
        db,
        sponsoring_only=sponsoring_only,
        exclude_closed=exclude_closed,
        exclude_advanced_degree=exclude_advanced_degree,
        exclude_internships=exclude_internships,
        exclude_citizenship_required=exclude_citizenship_required,
        exclude_experienced=exclude_experienced,
    )

    scores: dict = {}
    rid = (resumeId or "").strip()
    if rid and jobs:
        scores = get_match_scores_for_jobs(
            db,
            resume_id=rid,
            job_ids=[job.id for job in jobs],
        )

    job_responses = [
        JobResponse.model_validate(job).model_copy(
            update={"match_score": scores.get(job.id)}
        )
        for job in jobs
    ]

    return JobListResponse(
        jobs=job_responses,
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


@app.patch("/api/jobs/{job_id}/saved", response_model=JobResponse)
def update_job_saved(
    job_id: uuid.UUID,
    body: SavedUpdate,
    db: Session = Depends(get_db),
):
    job = set_job_saved(db, job_id, body.saved)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@app.patch("/api/jobs/{job_id}/flagged", response_model=JobResponse)
def update_job_flagged(
    job_id: uuid.UUID,
    body: FlaggedUpdate,
    db: Session = Depends(get_db),
):
    """Hide (or unhide) a job from the main list without deleting it."""
    job = set_job_flagged(db, job_id, body.flagged)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@app.get("/api/jobs/flagged", response_model=JobListResponse)
def list_flagged_jobs(
    company: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    max_age: Optional[str] = Query(None),
    resumeId: Optional[str] = Query(None),
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Jobs the user manually flagged (hidden from the main list)."""
    jobs, total = get_jobs(
        db,
        flagged=True,
        company=company,
        source=source,
        max_age=max_age,
        limit=limit,
        offset=offset,
    )
    stats = get_job_stats(db)

    scores: dict = {}
    rid = (resumeId or "").strip()
    if rid and jobs:
        scores = get_match_scores_for_jobs(
            db,
            resume_id=rid,
            job_ids=[job.id for job in jobs],
        )

    job_responses = [
        JobResponse.model_validate(job).model_copy(
            update={"match_score": scores.get(job.id)}
        )
        for job in jobs
    ]

    return JobListResponse(
        jobs=job_responses,
        total=total,
        has_more=offset + len(jobs) < total,
        stats=JobStats(**stats),
    )


@app.delete("/api/jobs/{job_id}", status_code=204)
def remove_job(job_id: uuid.UUID, db: Session = Depends(get_db)):
    """Permanently delete a job. Prefer flagging via PATCH …/flagged."""
    if not delete_job(db, job_id):
        raise HTTPException(status_code=404, detail="Job not found")
    return Response(status_code=204)


def _http_from_matching(exc: MatchingError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.message)


@app.post("/api/resumes", response_model=ResumeUploadResponse)
async def upload_resume(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Upload a resume, extract text, parse once with the LLM, and store."""
    content = await file.read()
    try:
        row = await ingest_resume(
            db,
            filename=file.filename or "resume.pdf",
            content=content,
            content_type=file.content_type,
        )
    except ResumeValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except MatchingError as exc:
        raise _http_from_matching(exc) from exc

    return ResumeUploadResponse(
        resumeId=row.id,
        filename=row.filename,
        contentType=row.content_type,
        size=row.size,
        parsed=row.parsed,
    )


@app.get("/api/resumes/{resume_id}", response_model=ResumeDetailResponse)
def get_resume_detail(resume_id: str, db: Session = Depends(get_db)):
    row = get_resume_row(db, resume_id)
    if row is None:
        # Fall back to filesystem-only resumes (extension uploads without parse).
        try:
            meta, _ = get_resume(resume_id)
        except ResumeNotFoundError as exc:
            raise HTTPException(status_code=404, detail="Resume not found") from exc
        return ResumeDetailResponse(
            resumeId=meta.resume_id,
            filename=meta.filename,
            contentType=meta.content_type,
            size=meta.size,
            parsed={},
            createdAt=None,
        )

    return ResumeDetailResponse(
        resumeId=row.id,
        filename=row.filename,
        contentType=row.content_type,
        size=row.size,
        parsed=row.parsed or {},
        createdAt=row.created_at,
    )


@app.post("/api/jobs/{job_id}/analyze", response_model=AnalysisResponse)
async def analyze_job_resume(
    job_id: uuid.UUID,
    body: AnalyzeRequest,
    db: Session = Depends(get_db),
):
    service = MatchingService()
    try:
        return await service.analyze_job(
            db,
            job_id=job_id,
            resume_id=body.resumeId,
            refresh=body.refresh,
            description=body.description,
        )
    except DescriptionMissingError as exc:
        raise _http_from_matching(exc) from exc
    except MatchingError as exc:
        raise _http_from_matching(exc) from exc


@app.post("/api/jobs/analyze/batch")
async def analyze_jobs_batch(body: BatchAnalyzeRequest):
    """Analyze multiple jobs concurrently; stream progress via SSE."""

    async def event_stream():
        total = len(body.jobIds)
        counters = {"completed": 0, "failed": 0}
        lock = asyncio.Lock()
        semaphore = asyncio.Semaphore(BATCH_CONCURRENCY)
        queue: asyncio.Queue[dict] = asyncio.Queue()

        async def worker(job_id: uuid.UUID) -> None:
            db = SessionLocal()
            try:
                async with semaphore:
                    service = MatchingService()
                    try:
                        result = await service.analyze_job(
                            db,
                            job_id=job_id,
                            resume_id=body.resumeId,
                            refresh=body.refresh,
                        )
                        async with lock:
                            counters["completed"] += 1
                            completed = counters["completed"]
                            failed = counters["failed"]
                        await queue.put(
                            {
                                "event": "result",
                                "data": {
                                    "jobId": str(job_id),
                                    "status": "completed",
                                    "analysis": result.model_dump(mode="json"),
                                },
                            }
                        )
                    except MatchingError as exc:
                        async with lock:
                            counters["failed"] += 1
                            completed = counters["completed"]
                            failed = counters["failed"]
                        await queue.put(
                            {
                                "event": "error",
                                "data": {
                                    "jobId": str(job_id),
                                    "status": "failed",
                                    "error": exc.message,
                                },
                            }
                        )
                    except Exception as exc:
                        logger.exception("Batch analyze failed for %s", job_id)
                        async with lock:
                            counters["failed"] += 1
                            completed = counters["completed"]
                            failed = counters["failed"]
                        await queue.put(
                            {
                                "event": "error",
                                "data": {
                                    "jobId": str(job_id),
                                    "status": "failed",
                                    "error": str(exc) or "Unexpected error",
                                },
                            }
                        )
                    remaining = total - completed - failed
                    await queue.put(
                        {
                            "event": "progress",
                            "data": {
                                "completed": completed,
                                "failed": failed,
                                "remaining": remaining,
                                "total": total,
                                "message": (
                                    f"Analyzing {completed + failed} / {total} jobs..."
                                ),
                            },
                        }
                    )
            finally:
                db.close()

        tasks = [asyncio.create_task(worker(jid)) for jid in body.jobIds]

        yield _sse(
            "progress",
            {
                "completed": 0,
                "failed": 0,
                "remaining": total,
                "total": total,
                "message": f"Analyzing 0 / {total} jobs...",
            },
        )

        finished = 0
        while finished < total:
            item = await queue.get()
            yield _sse(item["event"], item["data"])
            if item["event"] in ("result", "error"):
                finished += 1

        await asyncio.gather(*tasks, return_exceptions=True)
        yield _sse(
            "done",
            {
                "completed": counters["completed"],
                "failed": counters["failed"],
                "remaining": 0,
                "total": total,
            },
        )

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@app.post("/extension/job", response_model=AnalysisResponse)
async def analyze_extension_job(
    body: ExtensionJobAnalyzeRequest,
    db: Session = Depends(get_db),
):
    """Analyze resume against a job page scraped by the Chrome extension.

    Prefers the client-supplied description when it is richer than the DB,
    upserts a job row by apply URL, and reuses the matching cache.
    """
    service = MatchingService()
    try:
        return await service.analyze_from_extension(db, body)
    except DescriptionMissingError as exc:
        raise _http_from_matching(exc) from exc
    except MatchingError as exc:
        raise _http_from_matching(exc) from exc


@app.post("/extension/job/{job_id}/description", response_model=JobResponse)
def save_extension_job_description(
    job_id: uuid.UUID,
    body: SaveJobDescriptionRequest,
    db: Session = Depends(get_db),
):
    """Persist a manually selected / clipboard job description onto a job row."""
    try:
        return persist_job_description(db, job_id, body.description)
    except MatchingError as exc:
        raise _http_from_matching(exc) from exc


@app.post("/extension/resumes", response_model=ResumeUploadResponse)
async def upload_extension_resume(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Upload a resume for the Chrome extension (parse + store, same as /api/resumes).

    Paste the returned ``resumeId`` into extension Options for autofill and
    resume analysis.
    """
    content = await file.read()
    try:
        row = await ingest_resume(
            db,
            filename=file.filename or "resume.pdf",
            content=content,
            content_type=file.content_type,
        )
    except ResumeValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except MatchingError as exc:
        raise _http_from_matching(exc) from exc

    return ResumeUploadResponse(
        resumeId=row.id,
        filename=row.filename,
        contentType=row.content_type,
        size=row.size,
        parsed=row.parsed,
    )


@app.post("/extension/upload")
def download_extension_resume(body: ResumeDownloadRequest):
    """Serve a resume blob for the Chrome extension autofill uploader.

    The extension posts ``{ "resumeId": "..." }`` and expects a binary response
    (not JSON). Name matches the extension client path in ``chrome-extension``.
    """
    try:
        meta, data = get_resume(body.resumeId)
    except ResumeNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    # RFC 5987 filename so spaces / non-ASCII stay intact on attach.
    disposition = (
        f'attachment; filename="{meta.filename}"; '
        f"filename*=UTF-8''{quote(meta.filename)}"
    )
    return Response(
        content=data,
        media_type=meta.content_type,
        headers={"Content-Disposition": disposition},
    )


@app.post("/extension/profile", response_model=ExtensionUserProfile)
async def extension_profile(
    body: ExtensionProfileRequest,
    db: Session = Depends(get_db),
):
    """Return a UserProfile-shaped payload derived from the parsed resume.

    Contact fields (name, email, phone, LinkedIn, work auth) are left empty;
    the extension cache remains the source of truth for those. Education /
    degree / graduation / yearsExperience are filled from ParsedResume when
    available.
    """
    service = MatchingService()
    try:
        row = await service.ensure_resume_parsed(db, body.resumeId)
    except MatchingError as exc:
        raise _http_from_matching(exc) from exc

    try:
        parsed = ParsedResume.model_validate(row.parsed or {})
    except Exception:
        parsed = ParsedResume()
    return profile_from_parsed(parsed)


@app.post("/extension/autofill/ai", response_model=AiAutofillResponse)
async def extension_ai_autofill(
    body: AiAutofillRequest,
    db: Session = Depends(get_db),
):
    """AI fallback: map unresolved form fields using Groq + merged profile."""
    service = AutofillService()
    try:
        return await service.suggest_field_values(
            db,
            resume_id=body.resumeId,
            fields=body.fields,
            profile=body.profile,
            job=body.job,
            ats=body.ats,
        )
    except MatchingError as exc:
        raise _http_from_matching(exc) from exc
