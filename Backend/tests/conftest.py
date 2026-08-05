"""Shared fixtures for fetcher unit tests."""

from __future__ import annotations

import pytest


@pytest.fixture
def greenhouse_payload() -> dict:
    return {
        "id": 123456,
        "title": "Software Engineer",
        "company_name": "Acme",
        "content": "<p>Build things.</p><ul><li>Python</li><li>SQL</li></ul>",
        "absolute_url": "https://job-boards.greenhouse.io/acme/jobs/123456",
    }


@pytest.fixture
def lever_payload() -> dict:
    return {
        "id": "abc-def",
        "text": "Backend Engineer",
        "descriptionPlain": "Ship APIs.",
        "description": "<p>Ship APIs.</p>",
        "lists": [
            {
                "text": "Requirements",
                "content": "<ul><li>Go</li><li>Postgres</li></ul>",
            }
        ],
    }


@pytest.fixture
def ashby_board_payload() -> dict:
    return {
        "apiVersion": "1",
        "jobs": [
            {
                "id": "11111111-2222-3333-4444-555555555555",
                "title": "Platform Engineer",
                "descriptionPlain": "Own the platform.",
                "descriptionHtml": "<p>Own the platform.</p>",
                "jobUrl": (
                    "https://jobs.ashbyhq.com/acme/"
                    "11111111-2222-3333-4444-555555555555"
                ),
            }
        ],
    }


@pytest.fixture
def smartrecruiters_payload() -> dict:
    return {
        "id": "107099726",
        "uuid": "0552caa6-96df-40c6-8c9d-642c7ef67a1c",
        "name": "Maintenance Mechanic",
        "company": {"name": "Acme Corp", "identifier": "AcmeCorp"},
        "jobAd": {
            "companyDescription": "<p>We build tools.</p>",
            "jobDescription": "<p>Fix machines.</p>",
            "qualifications": "<ul><li>2 years experience</li></ul>",
            "additionalInformation": "<p>Benefits included.</p>",
        },
    }
