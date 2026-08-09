"""Lever public board listing source."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from fetchers.exceptions import FetchError
from model.job import Job
from processors.age import datetime_to_age_string, parse_posted_at
from processors.normalize import normalize_job
from sources.http import http_get_json

logger = logging.getLogger(__name__)

_API_GLOBAL = "https://api.lever.co/v0/postings"
_API_EU = "https://api.eu.lever.co/v0/postings"


class LeverBoardSource:
    """List jobs for one or more Lever company site names."""

    name = "lever"

    def __init__(
        self,
        companies: list[dict[str, Any]],
        *,
        client: httpx.AsyncClient | None = None,
        timeout_seconds: float = 30.0,
        request_delay_ms: int = 0,
    ) -> None:
        self._companies = [
            c for c in companies if c.get("ats") == "lever" and c.get("enabled", True)
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
                jobs.extend(await self._fetch_board(token, display))
            except Exception:  # noqa: BLE001
                logger.exception(
                    "Lever board failed company=%s token=%s",
                    display,
                    token,
                )
        logger.info("Lever: total jobs=%s boards=%s", len(jobs), len(self._companies))
        return jobs

    async def _fetch_board(self, token: str, company_name: str) -> list[Job]:
        endpoint = f"{_API_GLOBAL}/{token}"
        try:
            payload = await http_get_json(
                endpoint,
                client=self._client,
                params={"mode": "json"},
                timeout=self._timeout,
                delay_ms=self._delay_ms,
            )
        except FetchError:
            endpoint = f"{_API_EU}/{token}"
            payload = await http_get_json(
                endpoint,
                client=self._client,
                params={"mode": "json"},
                timeout=self._timeout,
                delay_ms=self._delay_ms,
            )

        if not isinstance(payload, list):
            raise FetchError("Unsupported Lever board response", url=endpoint)

        jobs: list[Job] = []
        for item in payload:
            if not isinstance(item, dict):
                continue
            try:
                jobs.append(self._to_job(item, company_name, token))
            except Exception:  # noqa: BLE001
                logger.exception(
                    "Lever: skip job company=%s id=%s",
                    company_name,
                    item.get("id"),
                )
        logger.info(
            "Lever board=%s company=%s jobs=%s",
            token,
            company_name,
            len(jobs),
        )
        return jobs

    def _to_job(self, item: dict[str, Any], company_name: str, token: str) -> Job:
        job_id = item.get("id")
        title = str(item.get("text") or "").strip()
        if not title or not job_id:
            raise ValueError("missing title or id")

        apply_url = item.get("hostedUrl") or item.get("applyUrl")
        if not isinstance(apply_url, str) or not apply_url:
            apply_url = f"https://jobs.lever.co/{token}/{job_id}"

        location = "Unknown"
        categories = item.get("categories")
        if isinstance(categories, dict):
            loc = categories.get("location")
            if isinstance(loc, str) and loc.strip():
                location = loc.strip()
        if location == "Unknown" and isinstance(item.get("country"), str):
            location = item["country"].strip() or "Unknown"

        posted = parse_posted_at(item.get("createdAt")) or parse_posted_at(
            item.get("updatedAt")
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
