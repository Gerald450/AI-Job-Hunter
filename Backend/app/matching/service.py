"""On-demand resume matching orchestration."""

from __future__ import annotations

import logging
import uuid
from typing import Any

from database.crud import get_job_by_id
from database.jobmodel import JobModel
from database.resume_crud import (
    get_cached_analysis,
    get_resume_row,
    save_analysis,
)
from database.resumemodel import ResumeAnalysisModel, ResumeModel
from fetchers.exceptions import FetchError
from fetchers.router import FetcherRouter
from llm.base import LLMError, LLMProvider, LLMRateLimitError, LLMTimeoutError
from llm.groq import get_llm_provider
from matching.cache import description_hash as hash_description
from schemas.analysis import AnalysisResponse, ParsedResume, ResumeMatchResult
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

MISSING_DESCRIPTION_MESSAGE = (
    "Unable to retrieve the job description.\n\n"
    "Resume analysis cannot be performed for this job."
)


class MatchingError(Exception):
    """Domain error for resume matching failures."""

    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


class DescriptionMissingError(MatchingError):
    def __init__(self) -> None:
        super().__init__(MISSING_DESCRIPTION_MESSAGE, status_code=422)


def analysis_to_response(
    row: ResumeAnalysisModel,
    *,
    cached: bool = False,
    company: str | None = None,
    role: str | None = None,
) -> AnalysisResponse:
    return AnalysisResponse(
        id=str(row.id),
        jobId=str(row.job_id),
        resumeId=row.resume_id,
        company=company,
        role=role,
        overall_match=row.overall_match,
        summary=row.summary or "",
        strengths=list(row.strengths or []),
        missing_skills=list(row.missing_skills or []),
        recommended_improvements=list(row.recommendations or []),
        matched_keywords=list(row.matched_keywords or []),
        missing_keywords=list(row.missing_keywords or []),
        confidence=row.confidence,
        llm_provider=row.llm_provider,
        cached=cached,
        created_at=row.created_at,
    )


async def ensure_job_description(
    db: Session,
    job: JobModel,
    *,
    router: FetcherRouter | None = None,
) -> str:
    """Return a non-empty description, fetching and persisting when needed."""
    if job.description and job.description.strip():
        return job.description.strip()

    fetcher = router or FetcherRouter()
    try:
        fetched = await fetcher.fetch(job.apply_url)
    except FetchError as exc:
        logger.warning("Description fetch failed for job %s: %s", job.id, exc)
        raise DescriptionMissingError() from exc
    except Exception as exc:
        logger.exception("Unexpected description fetch error for job %s", job.id)
        raise DescriptionMissingError() from exc

    text = (fetched.description or "").strip()
    if not text:
        raise DescriptionMissingError()

    job.description = text
    db.commit()
    db.refresh(job)
    return text


class MatchingService:
    """Resolve job description, cache, and call the LLM for resume match."""

    def __init__(
        self,
        llm: LLMProvider | None = None,
        *,
        router: FetcherRouter | None = None,
    ) -> None:
        self._llm = llm
        self._router = router

    def _provider(self) -> LLMProvider:
        if self._llm is not None:
            return self._llm
        return get_llm_provider()

    def _load_resume(self, db: Session, resume_id: str) -> ResumeModel:
        row = get_resume_row(db, resume_id)
        if row is None:
            raise MatchingError("Resume not found", status_code=404)
        if not row.parsed:
            raise MatchingError(
                "Resume has not been parsed yet. Re-upload the resume.",
                status_code=400,
            )
        return row

    def _load_job(self, db: Session, job_id: uuid.UUID) -> JobModel:
        job = get_job_by_id(db, job_id)
        if job is None:
            raise MatchingError("Job not found", status_code=404)
        return job

    async def analyze_job(
        self,
        db: Session,
        *,
        job_id: uuid.UUID,
        resume_id: str,
        refresh: bool = False,
    ) -> AnalysisResponse:
        resume = self._load_resume(db, resume_id)
        job = self._load_job(db, job_id)

        try:
            description = await ensure_job_description(
                db, job, router=self._router
            )
        except DescriptionMissingError:
            raise

        desc_hash = hash_description(description)
        if not refresh:
            cached = get_cached_analysis(
                db,
                resume_id=resume.id,
                job_id=job.id,
                description_hash=desc_hash,
            )
            if cached is not None:
                return analysis_to_response(
                    cached,
                    cached=True,
                    company=job.company,
                    role=job.role,
                )

        provider = self._provider()
        try:
            parsed = ParsedResume.model_validate(resume.parsed)
            result: ResumeMatchResult = await provider.analyze_resume(
                parsed_resume=parsed,
                job_title=job.role,
                company=job.company,
                location=job.location or "",
                description=description,
            )
        except LLMRateLimitError as exc:
            raise MatchingError(str(exc), status_code=429) from exc
        except LLMTimeoutError as exc:
            raise MatchingError(str(exc), status_code=504) from exc
        except LLMError as exc:
            raise MatchingError(str(exc), status_code=502) from exc
        except Exception as exc:
            logger.exception("Unexpected LLM error analyzing job %s", job.id)
            raise MatchingError(
                "Resume analysis failed due to an unexpected error.",
                status_code=502,
            ) from exc

        row = save_analysis(
            db,
            resume_id=resume.id,
            job_id=job.id,
            result=result,
            description_hash=desc_hash,
            llm_provider=provider.name,
        )
        return analysis_to_response(
            row,
            cached=False,
            company=job.company,
            role=job.role,
        )


async def ingest_resume(
    db: Session,
    *,
    filename: str,
    content: bytes,
    content_type: str | None,
    llm: LLMProvider | None = None,
) -> ResumeModel:
    """Save binary, extract text, parse once with LLM, persist DB + sidecars."""
    from resumes.extract import extract_text
    from resumes.storage import (
        content_hash,
        save_parsed_resume,
        save_resume,
        save_resume_text,
    )
    from database.resume_crud import create_resume

    meta = save_resume(
        filename=filename,
        content=content,
        content_type=content_type,
    )
    text = extract_text(
        content=content,
        filename=meta.filename,
        content_type=meta.content_type,
    )
    save_resume_text(meta.resume_id, text)

    provider = llm or get_llm_provider()
    try:
        parsed = await provider.parse_resume(text)
    except LLMRateLimitError as exc:
        raise MatchingError(str(exc), status_code=429) from exc
    except LLMTimeoutError as exc:
        raise MatchingError(str(exc), status_code=504) from exc
    except LLMError as exc:
        raise MatchingError(str(exc), status_code=502) from exc

    parsed_dict: dict[str, Any] = parsed.model_dump()
    save_parsed_resume(meta.resume_id, parsed_dict)

    return create_resume(
        db,
        resume_id=meta.resume_id,
        filename=meta.filename,
        content_type=meta.content_type,
        size=meta.size,
        parsed=parsed_dict,
        content_hash=content_hash(content),
    )
