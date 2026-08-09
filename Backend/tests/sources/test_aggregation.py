"""Tests for JobAggregationService isolation and filtering."""

from __future__ import annotations

import pytest

from model.job import Job
from sources.aggregation import JobAggregationService
from utils.fingerprint import create_fingerprint


def _job(**overrides) -> Job:
    raw = {
        "company": "Acme",
        "role": "Software Engineer New Grad",
        "location": "San Francisco, CA",
        "apply_url": "https://example.com/jobs/1",
    }
    raw.update({k: v for k, v in overrides.items() if k in raw})
    data = {
        "company": overrides.get("company", "Acme"),
        "role": overrides.get("role", "Software Engineer New Grad"),
        "location": overrides.get("location", "San Francisco, CA"),
        "apply_url": overrides.get("apply_url", "https://example.com/jobs/1"),
        "age": "1d",
        "fingerprint": create_fingerprint(
            {
                "company": overrides.get("company", "Acme"),
                "role": overrides.get("role", "Software Engineer New Grad"),
                "location": overrides.get("location", "San Francisco, CA"),
                "apply_url": overrides.get("apply_url", "https://example.com/jobs/1"),
            }
        ),
        "source": overrides.get("source", "test"),
        "faang": False,
        "no_sponsorship": False,
        "citizenship_required": False,
        "closed": False,
        "advanced_degree": False,
        "ats": overrides.get("ats"),
        "external_id": overrides.get("external_id"),
        "role_family": overrides.get("role_family"),
    }
    return Job(**data)


class _OkSource:
    name = "ok"

    async def fetch_jobs(self):
        return [
            _job(apply_url="https://example.com/a", external_id="1", ats="greenhouse"),
            _job(
                role="Software Engineering Intern",
                apply_url="https://example.com/intern",
                external_id="2",
                ats="greenhouse",
            ),
            _job(
                role="Barista",
                apply_url="https://example.com/barista",
                external_id="3",
                ats="greenhouse",
            ),
            _job(
                location="London, UK",
                apply_url="https://example.com/uk",
                external_id="4",
                ats="greenhouse",
            ),
        ]


class _BoomSource:
    name = "boom"

    async def fetch_jobs(self):
        raise RuntimeError("provider down")


@pytest.mark.asyncio
async def test_aggregation_isolates_provider_failure_and_filters():
    service = JobAggregationService(sources=[_OkSource(), _BoomSource()])
    jobs, stats = await service.aggregate()

    assert len(stats.failures) == 1
    assert stats.failures[0].provider == "boom"
    assert len(jobs) == 1
    assert jobs[0].external_id == "1"
    assert jobs[0].role_family == "software_engineering"


@pytest.mark.asyncio
async def test_aggregation_dedupes_by_external_id():
    class DupSource:
        name = "dup"

        async def fetch_jobs(self):
            return [
                _job(external_id="same", ats="ashby", apply_url="https://a.example/1"),
                _job(external_id="same", ats="ashby", apply_url="https://a.example/2"),
            ]

    service = JobAggregationService(sources=[DupSource()])
    jobs, stats = await service.aggregate()
    assert len(jobs) == 1
    assert stats.duplicates_skipped == 1
