"""CRUD helpers for resumes and on-demand resume analyses."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from database.resumemodel import ResumeAnalysisModel, ResumeModel
from schemas.analysis import ResumeMatchResult
from sqlalchemy.orm import Session


def create_resume(
    db: Session,
    *,
    resume_id: str,
    filename: str,
    content_type: str,
    size: int,
    parsed: dict[str, Any],
    content_hash: str,
) -> ResumeModel:
    row = ResumeModel(
        id=resume_id,
        filename=filename,
        content_type=content_type,
        size=size,
        parsed=parsed,
        content_hash=content_hash,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def get_resume_row(db: Session, resume_id: str) -> Optional[ResumeModel]:
    return db.query(ResumeModel).filter(ResumeModel.id == resume_id).first()


def get_cached_analysis(
    db: Session,
    *,
    resume_id: str,
    job_id: uuid.UUID,
    description_hash: str,
) -> Optional[ResumeAnalysisModel]:
    """Return saved analysis when resume/job/description still match."""
    return (
        db.query(ResumeAnalysisModel)
        .filter(
            ResumeAnalysisModel.resume_id == resume_id,
            ResumeAnalysisModel.job_id == job_id,
            ResumeAnalysisModel.description_hash == description_hash,
        )
        .first()
    )


def get_analysis_for_job(
    db: Session,
    *,
    resume_id: str,
    job_id: uuid.UUID,
) -> Optional[ResumeAnalysisModel]:
    """Latest saved match for a resume+job pair (any description)."""
    return (
        db.query(ResumeAnalysisModel)
        .filter(
            ResumeAnalysisModel.resume_id == resume_id,
            ResumeAnalysisModel.job_id == job_id,
        )
        .first()
    )


def get_match_scores_for_jobs(
    db: Session,
    *,
    resume_id: str,
    job_ids: list[uuid.UUID],
) -> dict[uuid.UUID, int]:
    """Map job_id → overall_match for the given resume."""
    if not resume_id or not job_ids:
        return {}
    rows = (
        db.query(ResumeAnalysisModel.job_id, ResumeAnalysisModel.overall_match)
        .filter(
            ResumeAnalysisModel.resume_id == resume_id,
            ResumeAnalysisModel.job_id.in_(job_ids),
        )
        .all()
    )
    return {job_id: int(score) for job_id, score in rows}


def save_analysis(
    db: Session,
    *,
    resume_id: str,
    job_id: uuid.UUID,
    result: ResumeMatchResult,
    description_hash: str,
    llm_provider: str,
    replace: bool = False,
) -> ResumeAnalysisModel:
    """Upsert one analysis row per (resume_id, job_id).

    ``replace`` is retained for call-site compatibility; upsert always
    overwrites the previous match for this resume+job pair.
    """
    del replace  # always upsert

    existing = get_analysis_for_job(db, resume_id=resume_id, job_id=job_id)
    now = datetime.now(timezone.utc)

    if existing is not None:
        existing.overall_match = result.overall_match
        existing.summary = result.summary
        existing.strengths = list(result.strengths)
        existing.missing_skills = list(result.missing_skills)
        existing.recommendations = list(result.recommended_improvements)
        existing.matched_keywords = list(result.matched_keywords)
        existing.missing_keywords = list(result.missing_keywords)
        existing.confidence = result.confidence
        existing.llm_provider = llm_provider
        existing.description_hash = description_hash
        existing.created_at = now
        db.commit()
        db.refresh(existing)
        return existing

    row = ResumeAnalysisModel(
        job_id=job_id,
        resume_id=resume_id,
        overall_match=result.overall_match,
        summary=result.summary,
        strengths=list(result.strengths),
        missing_skills=list(result.missing_skills),
        recommendations=list(result.recommended_improvements),
        matched_keywords=list(result.matched_keywords),
        missing_keywords=list(result.missing_keywords),
        confidence=result.confidence,
        llm_provider=llm_provider,
        description_hash=description_hash,
        created_at=now,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
