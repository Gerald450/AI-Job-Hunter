"""SmartRecruiters public Postings API fetcher."""

from __future__ import annotations

import logging
import re
from typing import Any, ClassVar

from fetchers.base import BaseFetcher, JobDescription
from fetchers.exceptions import FetchError
from fetchers.utils import html_to_text, parse_url

logger = logging.getLogger(__name__)

_API_BASE = "https://api.smartrecruiters.com/v1/companies"
# Posting ids may be numeric or UUID; slug URLs use "{id}-{slug}".
_UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)
_NUMERIC_ID_RE = re.compile(r"^\d+")


class SmartRecruitersFetcher(BaseFetcher):
    """Fetch job descriptions via SmartRecruiters' public Postings API."""

    SOURCE: ClassVar[str] = "smartrecruiters"

    async def fetch(self, url: str) -> JobDescription:
        logger.info("Fetch started: source=%s url=%s", self.SOURCE, url)
        company, posting_id = self._parse_smartrecruiters_url(url)
        endpoint = f"{_API_BASE}/{company}/postings/{posting_id}"
        logger.info(
            "ATS detected: smartrecruiters company=%s posting_id=%s",
            company,
            posting_id,
        )
        logger.info("API endpoint used: %s", endpoint)

        response = await self._get(endpoint)
        self._ensure_ok(response, not_found_message="SmartRecruiters job not found")

        payload = self._parse_json(response)
        if not isinstance(payload, dict):
            raise FetchError(
                "Unsupported SmartRecruiters response: expected object",
                url=url,
            )

        description = self._extract_description(payload)
        if not description:
            raise FetchError("SmartRecruiters job description was empty", url=url)

        title = payload.get("name") if isinstance(payload.get("name"), str) else None
        company_name = company
        company_obj = payload.get("company")
        if isinstance(company_obj, dict):
            name = company_obj.get("name")
            if isinstance(name, str) and name.strip():
                company_name = name

        logger.info("Fetch success: source=%s posting_id=%s", self.SOURCE, posting_id)
        return JobDescription(
            description=description,
            source=self.SOURCE,
            title=title,
            company=company_name,
            raw=payload,
            url=url,
        )

    def _parse_smartrecruiters_url(self, url: str) -> tuple[str, str]:
        """Extract ``(company_identifier, posting_id)`` from a SmartRecruiters URL."""
        _, host, segments = parse_url(url)
        if "smartrecruiters.com" not in host:
            raise FetchError("Not a SmartRecruiters URL", url=url)

        # Common shapes:
        #   jobs.smartrecruiters.com/{company}/{uuid}
        #   www.smartrecruiters.com/{company}/{id}-{slug}
        #   careers.smartrecruiters.com/{company}/...
        if len(segments) < 2:
            raise FetchError(
                "Malformed SmartRecruiters URL: expected /{company}/{posting}",
                url=url,
            )

        company = segments[0]
        raw_posting = segments[1]
        posting_id = self._normalize_posting_id(raw_posting)
        if not company or not posting_id:
            raise FetchError(
                "Malformed SmartRecruiters URL: empty company or posting id",
                url=url,
            )
        return company, posting_id

    def _normalize_posting_id(self, raw: str) -> str:
        if _UUID_RE.match(raw):
            return raw
        # "{numericId}-{slug}" → numeric id
        match = _NUMERIC_ID_RE.match(raw)
        if match:
            return match.group(0)
        # Otherwise treat the whole segment as the id (UUID-like or opaque).
        return raw

    def _extract_description(self, payload: dict[str, Any]) -> str:
        job_ad = payload.get("jobAd")
        if not isinstance(job_ad, dict):
            # Some responses put HTML directly on the posting.
            for key in ("jobDescription", "description"):
                value = payload.get(key)
                if isinstance(value, str) and value.strip():
                    return html_to_text(value) if "<" in value else value.strip()
            return ""

        sections: list[str] = []
        for key in (
            "companyDescription",
            "jobDescription",
            "qualifications",
            "additionalInformation",
        ):
            value = job_ad.get(key)
            if isinstance(value, str) and value.strip():
                sections.append(html_to_text(value) if "<" in value else value.strip())

        return "\n\n".join(section for section in sections if section).strip()
