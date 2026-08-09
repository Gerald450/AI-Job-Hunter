"""Greenhouse public board listing source."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from fetchers.base import DEFAULT_TIMEOUT
from fetchers.exceptions import FetchError
from model.job import Job
from processors.age import datetime_to_age_string, parse_posted_at
from processors.apply_url import rewrite_apply_url
from processors.normalize import normalize_job
from sources.http import http_get_json

logger = logging.getLogger(__name__)

_API_BASE = "https://boards-api.greenhouse.io/v1/boards"


class GreenhouseBoardSource:
    """List jobs for one or more Greenhouse board tokens."""

    name = "greenhouse"

    def __init__(
        self,
        companies: list[dict[str, Any]],
        *,
        client: httpx.AsyncClient | None = None,
        timeout_seconds: float = 30.0,
        request_delay_ms: int = 0,
    ) -> None:
        self._companies = [
            c
            for c in companies
            if c.get("ats") == "greenhouse" and c.get("enabled", True)
        ]
        self._client = client
        self._timeout = httpx.Timeout(timeout_seconds, connect=10.0)
        self._delay_ms = request_delay_ms

    async def fetch_jobs(self) -> list[Job]:
        jobs: list[Job] = []
        for company in self._companies:
            token = str(company.get("board_token") or "").strip()
            display = str(company.get("name") or token)
            if not token:
                continue
            try:
                board_jobs = await self._fetch_board(token, display)
                jobs.extend(board_jobs)
            except Exception:  # noqa: BLE001
                logger.exception(
                    "Greenhouse board failed company=%s token=%s",
                    display,
                    token,
                )
        logger.info("Greenhouse: total jobs=%s boards=%s", len(jobs), len(self._companies))
        return jobs

    async def _fetch_board(self, token: str, company_name: str) -> list[Job]:
        endpoint = f"{_API_BASE}/{token}/jobs"
        payload = await http_get_json(
            endpoint,
            client=self._client,
            params={"content": "false"},
            timeout=self._timeout or DEFAULT_TIMEOUT,
            delay_ms=self._delay_ms,
        )
        if not isinstance(payload, dict):
            raise FetchError("Unsupported Greenhouse board response", url=endpoint)

        raw_jobs = payload.get("jobs")
        if not isinstance(raw_jobs, list):
            raise FetchError("Greenhouse board missing jobs list", url=endpoint)

        jobs: list[Job] = []
        for item in raw_jobs:
            if not isinstance(item, dict):
                continue
            try:
                jobs.append(self._to_job(item, company_name, token))
            except Exception:  # noqa: BLE001
                logger.exception(
                    "Greenhouse: skip job company=%s id=%s",
                    company_name,
                    item.get("id"),
                )
        logger.info(
            "Greenhouse board=%s company=%s jobs=%s",
            token,
            company_name,
            len(jobs),
        )
        return jobs

    def _to_job(self, item: dict[str, Any], company_name: str, token: str) -> Job:
        job_id = item.get("id")
        title = str(item.get("title") or "").strip()
        if not title or job_id is None:
            raise ValueError("missing title or id")

        absolute = item.get("absolute_url")
        apply_url = (
            str(absolute)
            if isinstance(absolute, str) and absolute
            else f"https://boards.greenhouse.io/{token}/jobs/{job_id}"
        )
        apply_url = rewrite_apply_url(
            apply_url, role=title, external_id=str(job_id)
        )

        location = "Unknown"
        loc = item.get("location")
        if isinstance(loc, dict) and isinstance(loc.get("name"), str):
            location = loc["name"].strip() or "Unknown"

        posted = parse_posted_at(item.get("first_published")) or parse_posted_at(
            item.get("updated_at")
        )
        age = datetime_to_age_string(posted) if posted else "unknown"

        raw = {
            "company": company_name,
            "role": title,
            "location": location,
            "apply_url": apply_url,
            "age": age,
            "source": self.name,
            "ats": self.name,
            "external_id": str(job_id),
        }
        job = normalize_job(raw)
        job.ats = self.name
        job.external_id = str(job_id)
        job.source = self.name
        return job
