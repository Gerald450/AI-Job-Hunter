"""Tests for Workday URL parsing, CXS client strategies, and fetcher."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from fetchers.exceptions import FetchError
from fetchers.utils import html_to_text
from fetchers.workday import WorkdayFetcher
from fetchers.workday_client import (
    DirectJobGetFullPathStrategy,
    JobsSearchStrategy,
    TenantPatternCache,
    WorkdayClient,
)
from fetchers.workday_parser import (
    normalize_workday_payload,
    parse_workday_url,
)


def _mock_response(
    status_code: int,
    payload: dict | list | None = None,
    *,
    text: str = "",
    url: str = "https://company.wd5.myworkdayjobs.com/wday/cxs/company/Careers/job/x",
    headers: dict[str, str] | None = None,
) -> MagicMock:
    response = MagicMock(spec=httpx.Response)
    response.status_code = status_code
    response.url = url
    response.text = text
    response.headers = headers or {"content-type": "application/json"}
    if payload is not None:
        response.json.return_value = payload
    else:
        response.json.side_effect = ValueError("no json")
    return response


# ---------------------------------------------------------------------------
# URL parsing
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("url", "hostname", "tenant", "site", "locale", "job_id", "job_path"),
    [
        (
            "https://company.wd5.myworkdayjobs.com/en-US/Careers/job/Seattle-WA/Software-Engineer_R12345",
            "company.wd5.myworkdayjobs.com",
            "company",
            "Careers",
            "en-US",
            "Software-Engineer_R12345",
            "/job/Seattle-WA/Software-Engineer_R12345",
        ),
        (
            "https://company.wd5.myworkdayjobs.com/Careers/job/Software-Engineer_R12345",
            "company.wd5.myworkdayjobs.com",
            "company",
            "Careers",
            None,
            "Software-Engineer_R12345",
            "/job/Software-Engineer_R12345",
        ),
        (
            "https://company.wd5.myworkdayjobs.com/External/job/Location/Team/JR12345",
            "company.wd5.myworkdayjobs.com",
            "company",
            "External",
            None,
            "JR12345",
            "/job/Location/Team/JR12345",
        ),
        (
            "https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/US/Engineer_JR123",
            "nvidia.wd5.myworkdayjobs.com",
            "nvidia",
            "NVIDIAExternalCareerSite",
            "en-US",
            "Engineer_JR123",
            "/job/US/Engineer_JR123",
        ),
        (
            "https://boeing.wd1.myworkdayjobs.com/en-GB/EXTERNAL_CAREERS/job/Job_REQ99",
            "boeing.wd1.myworkdayjobs.com",
            "boeing",
            "EXTERNAL_CAREERS",
            "en-GB",
            "Job_REQ99",
            "/job/Job_REQ99",
        ),
    ],
)
def test_parse_workday_url_formats(
    url: str,
    hostname: str,
    tenant: str,
    site: str,
    locale: str | None,
    job_id: str,
    job_path: str,
) -> None:
    parsed = parse_workday_url(url)
    assert parsed.hostname == hostname
    assert parsed.tenant == tenant
    assert parsed.site == site
    assert parsed.locale == locale
    assert parsed.job_id == job_id
    assert parsed.job_path == job_path
    assert parsed.cxs_prefix == f"/wday/cxs/{tenant}/{site}"


@pytest.mark.parametrize(
    "url",
    [
        "",
        "https://example.com/jobs/123",
        "https://company.wd5.myworkdayjobs.com/Careers",
        "https://company.wd5.myworkdayjobs.com/Careers/jobs/nope",
        "https://company.wd5.myworkdayjobs.com/job/Missing-Site_R1",
        "https://company.wd5.myworkdayjobs.com/Careers/job/",
    ],
)
def test_parse_workday_url_malformed(url: str) -> None:
    with pytest.raises(FetchError):
        parse_workday_url(url)


# ---------------------------------------------------------------------------
# JSON / html_to_text integration
# ---------------------------------------------------------------------------


def test_normalize_workday_payload_merges_sections(workday_payload: dict) -> None:
    parsed = normalize_workday_payload(workday_payload, fallback_company="company")
    assert parsed.title == "Software Engineer"
    assert parsed.company == "Acme"
    assert "Build reliable systems." in parsed.description
    assert "- Python" in parsed.description
    assert "Responsibilities" in parsed.description
    assert "Own services end-to-end." in parsed.description
    assert "Qualifications" in parsed.description
    assert "- 3+ years experience" in parsed.description
    assert "Time Type" in parsed.description
    assert "Full time" in parsed.description
    assert "<p>" not in parsed.description


def test_normalize_workday_payload_html_to_text_integration() -> None:
    payload = {
        "title": "SRE",
        "jobDescription": "<p>Keep lights on.</p><ul><li>On-call</li></ul>",
    }
    parsed = normalize_workday_payload(payload, fallback_company="acme")
    expected = html_to_text(payload["jobDescription"])
    assert expected in parsed.description
    assert "- On-call" in parsed.description
    assert parsed.company == "acme"


def test_normalize_workday_payload_missing_description() -> None:
    with pytest.raises(FetchError, match="missing job description"):
        normalize_workday_payload({"title": "Empty"})


# ---------------------------------------------------------------------------
# Client: fallback endpoint logic + pattern cache
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_client_falls_back_across_endpoint_patterns(
    workday_payload: dict,
) -> None:
    http = AsyncMock(spec=httpx.AsyncClient)
    http.request.side_effect = [
        _mock_response(404),  # full path GET miss
        _mock_response(  # jobs search hit
            200,
            {
                "total": 1,
                "jobPostings": [
                    {
                        "title": "Software Engineer",
                        "externalPath": "/job/Seattle-WA/Software-Engineer_R12345",
                    }
                ],
            },
        ),
        _mock_response(200, workday_payload),  # detail GET after search
    ]

    client = WorkdayClient(
        client=http,
        strategies=(
            DirectJobGetFullPathStrategy(),
            JobsSearchStrategy(),
        ),
        max_retries=0,
    )
    parsed = parse_workday_url(
        "https://company.wd5.myworkdayjobs.com/en-US/Careers/job/Seattle-WA/Software-Engineer_R12345"
    )
    result = await client.fetch_job(parsed)

    assert result.pattern_name == JobsSearchStrategy.name
    assert result.payload == workday_payload
    assert client.pattern_cache.get("company") == JobsSearchStrategy.name

    methods = [c.args[0] for c in http.request.await_args_list]
    assert methods[0] == "GET"
    assert methods[1] == "POST"
    assert methods[2] == "GET"


@pytest.mark.asyncio
async def test_client_uses_cached_pattern_first(workday_payload: dict) -> None:
    http = AsyncMock(spec=httpx.AsyncClient)
    http.request.return_value = _mock_response(200, workday_payload)

    cache = TenantPatternCache()
    cache.set("company", DirectJobGetFullPathStrategy.name)

    client = WorkdayClient(
        client=http,
        pattern_cache=cache,
        strategies=(
            JobsSearchStrategy(),
            DirectJobGetFullPathStrategy(),
        ),
        max_retries=0,
    )
    parsed = parse_workday_url(
        "https://company.wd5.myworkdayjobs.com/Careers/job/Software-Engineer_R12345"
    )
    result = await client.fetch_job(parsed)

    assert result.pattern_name == DirectJobGetFullPathStrategy.name
    assert http.request.await_count == 1
    assert http.request.await_args.args[0] == "GET"
    assert "/wday/cxs/company/Careers/job/Software-Engineer_R12345" in (
        http.request.await_args.args[1]
    )


@pytest.mark.asyncio
async def test_client_all_patterns_fail() -> None:
    http = AsyncMock(spec=httpx.AsyncClient)
    http.request.return_value = _mock_response(404)

    client = WorkdayClient(
        client=http,
        strategies=(DirectJobGetFullPathStrategy(),),
        max_retries=0,
    )
    parsed = parse_workday_url(
        "https://company.wd5.myworkdayjobs.com/Careers/job/Software-Engineer_R12345"
    )
    with pytest.raises(FetchError, match="not found"):
        await client.fetch_job(parsed)


@pytest.mark.asyncio
async def test_client_handles_403() -> None:
    http = AsyncMock(spec=httpx.AsyncClient)
    http.request.return_value = _mock_response(403)

    client = WorkdayClient(
        client=http,
        strategies=(DirectJobGetFullPathStrategy(),),
        max_retries=0,
    )
    parsed = parse_workday_url(
        "https://company.wd5.myworkdayjobs.com/Careers/job/Software-Engineer_R12345"
    )
    with pytest.raises(FetchError, match="403"):
        await client.fetch_job(parsed)


@pytest.mark.asyncio
async def test_client_skips_malformed_json() -> None:
    http = AsyncMock(spec=httpx.AsyncClient)
    bad = _mock_response(200, None)
    http.request.return_value = bad

    client = WorkdayClient(
        client=http,
        strategies=(DirectJobGetFullPathStrategy(),),
        max_retries=0,
    )
    parsed = parse_workday_url(
        "https://company.wd5.myworkdayjobs.com/Careers/job/Software-Engineer_R12345"
    )
    with pytest.raises(FetchError, match="not found"):
        await client.fetch_job(parsed)


# ---------------------------------------------------------------------------
# Fetcher orchestration
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_workday_fetch_success(workday_payload: dict) -> None:
    http = AsyncMock(spec=httpx.AsyncClient)
    http.request.return_value = _mock_response(200, workday_payload)

    fetcher = WorkdayFetcher(client=http, allow_html_fallback=False)
    result = await fetcher.fetch(
        "https://company.wd5.myworkdayjobs.com/en-US/Careers/job/Seattle-WA/Software-Engineer_R12345"
    )

    assert result.source == "workday"
    assert result.title == "Software Engineer"
    assert result.company == "Acme"
    assert "Build reliable systems." in result.description
    assert "- Python" in result.description
    assert result.raw == workday_payload
    assert fetcher.pattern_cache.get("company") == DirectJobGetFullPathStrategy.name


@pytest.mark.asyncio
async def test_workday_html_fallback_after_api_failure() -> None:
    http = AsyncMock(spec=httpx.AsyncClient)

    def _side_effect(method: str, endpoint: str, **_kwargs: object) -> MagicMock:
        if method == "GET" and "myworkdayjobs.com/en-US/" in endpoint:
            return _mock_response(
                200,
                None,
                text=(
                    "<html><head><title>SWE - Acme</title></head>"
                    "<body><main><p>Fallback description.</p>"
                    "<ul><li>Go</li></ul></main></body></html>"
                ),
                url=endpoint,
                headers={"content-type": "text/html"},
            )
        return _mock_response(404)

    http.request.side_effect = _side_effect
    http.get.side_effect = lambda endpoint, **kwargs: _side_effect(
        "GET", endpoint, **kwargs
    )

    fetcher = WorkdayFetcher(client=http, allow_html_fallback=True)
    result = await fetcher.fetch(
        "https://company.wd5.myworkdayjobs.com/en-US/Careers/job/Seattle-WA/Software-Engineer_R12345"
    )

    assert result.source == "workday"
    assert "Fallback description." in result.description
    assert "- Go" in result.description
    assert result.raw is None


@pytest.mark.asyncio
async def test_workday_api_failure_without_fallback() -> None:
    http = AsyncMock(spec=httpx.AsyncClient)
    http.request.return_value = _mock_response(500, {"error": "boom"})

    fetcher = WorkdayFetcher(client=http, allow_html_fallback=False)
    with pytest.raises(FetchError, match="not found"):
        await fetcher.fetch(
            "https://company.wd5.myworkdayjobs.com/Careers/job/Software-Engineer_R12345"
        )


@pytest.mark.asyncio
async def test_workday_register_custom_strategy(workday_payload: dict) -> None:
    """New patterns can be registered without modifying existing strategies."""
    http = AsyncMock(spec=httpx.AsyncClient)
    http.request.return_value = _mock_response(200, workday_payload)

    client = WorkdayClient(
        client=http,
        strategies=(DirectJobGetFullPathStrategy(),),
        max_retries=0,
    )

    class CustomStrategy(DirectJobGetFullPathStrategy):
        name = "custom_clone"

    client.register_strategy(CustomStrategy())
    assert "custom_clone" in {s.name for s in client._strategies}


def test_tenant_pattern_cache_roundtrip() -> None:
    cache = TenantPatternCache()
    cache.set("Target", "cxs_job_get_full_path")
    cache.set("nvidia", "cxs_jobs_search")
    assert cache.get("target") == "cxs_job_get_full_path"
    assert cache.as_dict() == {
        "target": "cxs_job_get_full_path",
        "nvidia": "cxs_jobs_search",
    }
    cache.invalidate("target")
    assert cache.get("target") is None
