"""Tests for resume analysis upsert / match score helpers."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock

from database.resume_crud import (
    get_analysis_for_job,
    get_cached_analysis,
    get_match_scores_for_jobs,
    save_analysis,
)
from schemas.analysis import ResumeMatchResult


def _result(score: int = 80) -> ResumeMatchResult:
    return ResumeMatchResult(
        overall_match=score,
        summary=f"score {score}",
        strengths=["Python"],
        missing_skills=[],
        recommended_improvements=[],
        matched_keywords=["Python"],
        missing_keywords=[],
        confidence="High",
    )


def test_save_analysis_inserts_then_upserts() -> None:
    resume_id = "resume_aaaaaaaaaaaa"
    job_id = uuid.uuid4()
    stored: dict[str, MagicMock] = {}

    db = MagicMock()

    def query_side_effect(model):
        q = MagicMock()

        def filter_(*_a, **_k):
            f = MagicMock()
            f.first.return_value = stored.get("row")
            f.all.return_value = []
            return f

        q.filter.side_effect = filter_
        return q

    db.query.side_effect = query_side_effect

    def add(row):
        stored["row"] = row

    db.add.side_effect = add
    db.commit.side_effect = lambda: None
    db.refresh.side_effect = lambda row: None

    first = save_analysis(
        db,
        resume_id=resume_id,
        job_id=job_id,
        result=_result(70),
        description_hash="hash1",
        llm_provider="groq",
    )
    assert first.overall_match == 70
    assert first.description_hash == "hash1"
    assert db.add.call_count == 1

    # Simulate persisted row for the second call
    stored["row"].overall_match = 70
    stored["row"].description_hash = "hash1"

    second = save_analysis(
        db,
        resume_id=resume_id,
        job_id=job_id,
        result=_result(91),
        description_hash="hash2",
        llm_provider="groq",
        replace=True,
    )
    assert second is stored["row"]
    assert second.overall_match == 91
    assert second.description_hash == "hash2"
    assert db.add.call_count == 1  # upsert, not insert again


def test_get_cached_analysis_requires_matching_hash() -> None:
    db = MagicMock()
    row = MagicMock()
    q = MagicMock()
    f = MagicMock()
    f.first.return_value = row
    q.filter.return_value = f
    db.query.return_value = q

    found = get_cached_analysis(
        db,
        resume_id="resume_aaaaaaaaaaaa",
        job_id=uuid.uuid4(),
        description_hash="abc",
    )
    assert found is row


def test_get_match_scores_for_jobs() -> None:
    job_a = uuid.uuid4()
    job_b = uuid.uuid4()
    db = MagicMock()
    q = MagicMock()
    f = MagicMock()
    f.all.return_value = [(job_a, 88), (job_b, 42)]
    q.filter.return_value = f
    db.query.return_value = q

    scores = get_match_scores_for_jobs(
        db,
        resume_id="resume_aaaaaaaaaaaa",
        job_ids=[job_a, job_b],
    )
    assert scores == {job_a: 88, job_b: 42}


def test_get_match_scores_empty_inputs() -> None:
    db = MagicMock()
    assert get_match_scores_for_jobs(db, resume_id="", job_ids=[]) == {}
    assert (
        get_match_scores_for_jobs(db, resume_id="r", job_ids=[]) == {}
    )
    db.query.assert_not_called()


def test_get_analysis_for_job() -> None:
    db = MagicMock()
    row = MagicMock()
    row.created_at = datetime.now(timezone.utc)
    q = MagicMock()
    f = MagicMock()
    f.first.return_value = row
    q.filter.return_value = f
    db.query.return_value = q

    assert (
        get_analysis_for_job(
            db, resume_id="resume_aaaaaaaaaaaa", job_id=uuid.uuid4()
        )
        is row
    )
