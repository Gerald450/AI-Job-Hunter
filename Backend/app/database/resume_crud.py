"""CRUD helpers for resumes and cached resume analyses."""

from __future__ import annotations

import uuid
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
    return (
        db.query(ResumeAnalysisModel)
        .filter(
            ResumeAnalysisModel.resume_id == resume_id,
            ResumeAnalysisModel.job_id == job_id,
            ResumeAnalysisModel.description_hash == description_hash,
        )
        .order_by(ResumeAnalysisModel.created_at.desc())
        .first()
    )


def delete_analyses_for_hash(
    db: Session,
    *,
    resume_id: str,
    job_id: uuid.UUID,
    description_hash: str,
) -> int:
    """Remove cached rows for the same resume/job/description (refresh path)."""
    deleted = (
        db.query(ResumeAnalysisModel)
        .filter(
            ResumeAnalysisModel.resume_id == resume_id,
            ResumeAnalysisModel.job_id == job_id,
            ResumeAnalysisModel.description_hash == description_hash,
        )
        .delete(synchronize_session=False)
    )
    db.commit()
    return int(deleted)


def save_analysis(
    db: Session,
    *,
    resume_id: str,
    job_id: uuid.UUID,
    result: ResumeMatchResult,
    description_hash: str,
    llm_provider: str,
    *,
    replace: bool = False,
) -> ResumeAnalysisModel:
    if replace:
        delete_analyses_for_hash(
            db,
            resume_id=resume_id,
            job_id=job_id,
            description_hash=description_hash,
        )
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
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
