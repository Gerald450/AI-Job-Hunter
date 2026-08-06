"""Greenhouse Job Board API fetcher."""

from __future__ import annotations

import logging
import re
from typing import ClassVar
from urllib.parse import parse_qs, urlparse

from fetchers.base import BaseFetcher, JobDescription
from fetchers.exceptions import FetchError
from fetchers.utils import html_to_text, parse_url

logger = logging.getLogger(__name__)

_API_BASE = "https://boards-api.greenhouse.io/v1/boards"
_JOB_ID_RE = re.compile(r"^\d+$")


class GreenhouseFetcher(BaseFetcher):
    """Fetch job descriptions via Greenhouse's public Job Board API."""

    SOURCE: ClassVar[str] = "greenhouse"

    async def fetch(self, url: str) -> JobDescription:
        logger.info("Fetch started: source=%s url=%s", self.SOURCE, url)
        board_token, job_id = self._parse_greenhouse_url(url)
        endpoint = f"{_API_BASE}/{board_token}/jobs/{job_id}"
        logger.info("ATS detected: greenhouse board=%s job_id=%s", board_token, job_id)
        logger.info("API endpoint used: %s", endpoint)

        response = await self._get(endpoint)
        self._ensure_ok(response, not_found_message="Greenhouse job not found")

        payload = self._parse_json(response)
        if not isinstance(payload, dict):
            raise FetchError("Unsupported Greenhouse response: expected object", url=url)

        content = payload.get("content")
        if not content or not isinstance(content, str):
            raise FetchError(
                "Unsupported Greenhouse response: missing job content",
                url=url,
            )

        description = html_to_text(content)
        if not description:
            raise FetchError("Greenhouse job description was empty", url=url)

        title = payload.get("title") if isinstance(payload.get("title"), str) else None
        company = (
            payload.get("company_name")
            if isinstance(payload.get("company_name"), str)
            else board_token
        )

        logger.info("Fetch success: source=%s job_id=%s", self.SOURCE, job_id)
        return JobDescription(
            description=description,
            source=self.SOURCE,
            title=title,
            company=company,
            raw=payload,
            url=url,
        )

    def _parse_greenhouse_url(self, url: str) -> tuple[str, str]:
        """Extract ``(board_token, job_id)`` from common Greenhouse URL shapes."""
        _, host, segments = parse_url(url)
        if "greenhouse.io" not in host:
            raise FetchError("Not a Greenhouse URL", url=url)

        parsed = urlparse(url)
        query = parse_qs(parsed.query)

        # Embed style: /embed/job_app?for=company&token=123
        if "token" in query and _JOB_ID_RE.match(query["token"][0]):
            board = (query.get("for") or [None])[0]
            if not board:
                raise FetchError("Malformed Greenhouse URL: missing board token", url=url)
            return board, query["token"][0]

        # Path styles:
        #   /company/jobs/123456
        #   /company/job_app?token=123  (handled above)
        #   job-boards.greenhouse.io/company/jobs/123
        if "jobs" in segments:
            jobs_idx = segments.index("jobs")
            if jobs_idx == 0 or jobs_idx + 1 >= len(segments):
                raise FetchError(
                    "Malformed Greenhouse URL: expected /{company}/jobs/{id}",
                    url=url,
                )
            board_token = segments[jobs_idx - 1]
            job_id = segments[jobs_idx + 1]
            if not _JOB_ID_RE.match(job_id):
                raise FetchError(
                    f"Malformed Greenhouse URL: invalid job id '{job_id}'",
                    url=url,
                )
            return board_token, job_id

        # Fallback: gh_jid query param with board in path
        if "gh_jid" in query and _JOB_ID_RE.match(query["gh_jid"][0]):
            if not segments:
                raise FetchError(
                    "Malformed Greenhouse URL: missing board token",
                    url=url,
                )
            return segments[0], query["gh_jid"][0]

        raise FetchError(
            "Malformed Greenhouse URL: could not extract company and job id",
            url=url,
        )
