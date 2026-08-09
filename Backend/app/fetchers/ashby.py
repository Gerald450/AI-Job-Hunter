"""Ashby public Job Postings API fetcher."""

from __future__ import annotations

import logging
from typing import Any, ClassVar

from fetchers.base import BaseFetcher, JobDescription
from fetchers.exceptions import FetchError
from fetchers.utils import html_to_text, parse_url

logger = logging.getLogger(__name__)

_API_BASE = "https://api.ashbyhq.com/posting-api/job-board"


class AshbyFetcher(BaseFetcher):
    """Fetch job descriptions via Ashby's public posting-api (no Playwright)."""

    SOURCE: ClassVar[str] = "ashby"

    async def fetch(self, url: str) -> JobDescription:
        logger.info("Fetch started: source=%s url=%s", self.SOURCE, url)
        board_name, job_id = self._parse_ashby_url(url)
        logger.info("ATS detected: ashby board=%s job_id=%s", board_name, job_id)

        # Prefer the single-job endpoint when available; fall back to board list.
        job, raw = await self._fetch_job(board_name, job_id, url)

        description = self._extract_description(job)
        if not description:
            raise FetchError("Ashby job description was empty", url=url)

        title = job.get("title") if isinstance(job.get("title"), str) else None

        logger.info("Fetch success: source=%s job_id=%s", self.SOURCE, job_id)
        return JobDescription(
            description=description,
            source=self.SOURCE,
            title=title,
            company=board_name,
            raw=raw,
            url=url,
        )

    async def _fetch_job(
        self,
        board_name: str,
        job_id: str,
        url: str,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        single_endpoint = f"{_API_BASE}/{board_name}/job/{job_id}"
        logger.info("API endpoint used: %s", single_endpoint)
        response = await self._get(single_endpoint)

        if response.status_code == 200:
            payload = self._parse_json(response)
            if isinstance(payload, dict):
                # Some responses nest under "job".
                job = payload.get("job") if isinstance(payload.get("job"), dict) else payload
                if self._looks_like_job(job):
                    return job, payload  # type: ignore[return-value]

        # Boards often disable/auth-gate the single-job route (401/403) while the
        # public board list still includes full descriptions — fall back like 404.
        if response.status_code not in (401, 403, 404, 405, 501) and response.status_code >= 400:
            self._ensure_ok(response, not_found_message="Ashby job not found")

        board_endpoint = f"{_API_BASE}/{board_name}"
        logger.info("Ashby single-job miss; using board list: %s", board_endpoint)
        board_response = await self._get(board_endpoint)
        self._ensure_ok(board_response, not_found_message="Ashby job board not found")

        board_payload = self._parse_json(board_response)
        if not isinstance(board_payload, dict):
            raise FetchError("Unsupported Ashby response: expected object", url=url)

        jobs = board_payload.get("jobs")
        if not isinstance(jobs, list):
            raise FetchError("Unsupported Ashby response: missing jobs list", url=url)

        matched = self._find_job(jobs, job_id)
        if matched is None:
            raise FetchError("Ashby job not found on board", url=url)

        return matched, board_payload

    def _parse_ashby_url(self, url: str) -> tuple[str, str]:
        """Extract ``(board_name, job_id)`` from an Ashby job URL."""
        _, host, segments = parse_url(url)
        if "ashbyhq.com" not in host and "ashby" not in host:
            raise FetchError("Not an Ashby URL", url=url)

        # Expected: jobs.ashbyhq.com/{board}/{job_id}[/application]
        if len(segments) < 2:
            raise FetchError(
                "Malformed Ashby URL: expected /{board}/{job_id}",
                url=url,
            )

        board_name = segments[0]
        job_id = segments[1]
        if job_id.lower() == "application" and len(segments) >= 3:
            job_id = segments[2]

        if not board_name or not job_id or job_id.lower() == "application":
            raise FetchError(
                "Malformed Ashby URL: could not extract board and job id",
                url=url,
            )
        return board_name, job_id

    def _find_job(
        self,
        jobs: list[Any],
        job_id: str,
    ) -> dict[str, Any] | None:
        target = job_id.lower()
        for job in jobs:
            if not isinstance(job, dict):
                continue
            candidates = [
                job.get("id"),
                job.get("jobId"),
                job.get("jobPostingId"),
            ]
            for candidate in candidates:
                if isinstance(candidate, str) and candidate.lower() == target:
                    return job

            for key in ("jobUrl", "applyUrl"):
                value = job.get(key)
                if isinstance(value, str) and target in value.lower():
                    return job
        return None

    def _looks_like_job(self, job: Any) -> bool:
        return isinstance(job, dict) and (
            "descriptionPlain" in job
            or "descriptionHtml" in job
            or "title" in job
            or "jobUrl" in job
        )

    def _extract_description(self, job: dict[str, Any]) -> str:
        plain = job.get("descriptionPlain")
        if isinstance(plain, str) and plain.strip():
            return plain.strip()

        html = job.get("descriptionHtml")
        if isinstance(html, str) and html.strip():
            return html_to_text(html)

        return ""
