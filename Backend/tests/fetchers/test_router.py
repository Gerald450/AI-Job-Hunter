"""Tests for FetcherRouter ATS detection."""

from __future__ import annotations

import pytest

from fetchers.ashby import AshbyFetcher
from fetchers.exceptions import FetchError
from fetchers.generic import GenericFetcher
from fetchers.greenhouse import GreenhouseFetcher
from fetchers.lever import LeverFetcher
from fetchers.router import FetcherRouter
from fetchers.smartrecruiters import SmartRecruitersFetcher
from fetchers.workday import WorkdayFetcher


@pytest.mark.parametrize(
    ("url", "expected_source", "expected_type"),
    [
        (
            "https://job-boards.greenhouse.io/acme/jobs/123456",
            "greenhouse",
            GreenhouseFetcher,
        ),
        (
            "https://boards.greenhouse.io/stripe/jobs/999",
            "greenhouse",
            GreenhouseFetcher,
        ),
        (
            "https://jobs.lever.co/acme/posting-id-123",
            "lever",
            LeverFetcher,
        ),
        (
            "https://jobs.eu.lever.co/acme/posting-id-123",
            "lever",
            LeverFetcher,
        ),
        (
            "https://jobs.ashbyhq.com/acme/11111111-2222-3333-4444-555555555555",
            "ashby",
            AshbyFetcher,
        ),
        (
            "https://jobs.smartrecruiters.com/AcmeCorp/0552caa6-96df-40c6-8c9d-642c7ef67a1c",
            "smartrecruiters",
            SmartRecruitersFetcher,
        ),
        (
            "https://www.smartrecruiters.com/AcmeCorp/107099726-maintenance-mechanic",
            "smartrecruiters",
            SmartRecruitersFetcher,
        ),
        (
            "https://company.wd5.myworkdayjobs.com/en-US/Careers/job/Seattle-WA/Software-Engineer_R12345",
            "workday",
            WorkdayFetcher,
        ),
        (
            "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/job/US/Engineer_JR1",
            "workday",
            WorkdayFetcher,
        ),
        (
            "https://careers.example.com/jobs/123",
            "generic",
            GenericFetcher,
        ),
        (
            "https://company.com/careers/swe",
            "generic",
            GenericFetcher,
        ),
    ],
)
def test_router_detects_ats(
    url: str,
    expected_source: str,
    expected_type: type,
) -> None:
    router = FetcherRouter()
    assert router.detect_source(url) == expected_source
    fetcher = router.get_fetcher(url)
    assert isinstance(fetcher, expected_type)


@pytest.mark.parametrize(
    "url",
    [
        "",
        "   ",
        "not-a-url",
        "/relative/path",
    ],
)
def test_router_rejects_invalid_urls(url: str) -> None:
    router = FetcherRouter()
    with pytest.raises(FetchError):
        router.get_fetcher(url)
