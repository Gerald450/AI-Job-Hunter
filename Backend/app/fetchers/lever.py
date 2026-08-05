"""Lever Postings API fetcher."""

from __future__ import annotations

import logging
from typing import Any, ClassVar

from fetchers.base import BaseFetcher, JobDescription
from fetchers.exceptions import FetchError
from fetchers.utils import html_to_text, parse_url

logger = logging.getLogger(__name__)

_API_GLOBAL = "https://api.lever.co/v0/postings"
_API_EU = "https://api.eu.lever.co/v0/postings"


class LeverFetcher(BaseFetcher):
    """Fetch job descriptions via Lever's public Postings API."""

    SOURCE: ClassVar[str] = "lever"

    async def fetch(self, url: str) -> JobDescription:
        logger.info("Fetch started: source=%s url=%s", self.SOURCE, url)
        company, posting_id, use_eu = self._parse_lever_url(url)
        api_base = _API_EU if use_eu else _API_GLOBAL
        endpoint = f"{api_base}/{company}/{posting_id}"
        logger.info(
            "ATS detected: lever company=%s posting_id=%s eu=%s",
            company,
            posting_id,
            use_eu,
        )
        logger.info("API endpoint used: %s", endpoint)

        response = await self._get(endpoint, params={"mode": "json"})

        # Some tenants live on the other region — retry once on 404.
        if response.status_code == 404 and not use_eu:
            alt = f"{_API_EU}/{company}/{posting_id}"
            logger.info("Lever US miss; retrying EU endpoint: %s", alt)
            response = await self._get(alt, params={"mode": "json"})
        elif response.status_code == 404 and use_eu:
            alt = f"{_API_GLOBAL}/{company}/{posting_id}"
            logger.info("Lever EU miss; retrying US endpoint: %s", alt)
            response = await self._get(alt, params={"mode": "json"})

        self._ensure_ok(response, not_found_message="Lever job not found")

        payload = self._parse_json(response)
        if not isinstance(payload, dict):
            raise FetchError("Unsupported Lever response: expected object", url=url)

        description = self._extract_description(payload)
        if not description:
            raise FetchError("Lever job description was empty", url=url)

        title = payload.get("text") if isinstance(payload.get("text"), str) else None

        logger.info("Fetch success: source=%s posting_id=%s", self.SOURCE, posting_id)
        return JobDescription(
            description=description,
            source=self.SOURCE,
            title=title,
            company=company,
            raw=payload,
            url=url,
        )

    def _parse_lever_url(self, url: str) -> tuple[str, str, bool]:
        """Extract ``(company, posting_id, use_eu)`` from a Lever job URL."""
        _, host, segments = parse_url(url)
        if "lever.co" not in host:
            raise FetchError("Not a Lever URL", url=url)

        use_eu = host.startswith("jobs.eu.") or host.startswith("eu.")
        # Expected: jobs.lever.co/{company}/{posting_id}
        if len(segments) < 2:
            raise FetchError(
                "Malformed Lever URL: expected /{company}/{posting_id}",
                url=url,
            )

        company, posting_id = segments[0], segments[1]
        if not company or not posting_id:
            raise FetchError("Malformed Lever URL: empty company or posting id", url=url)
        return company, posting_id, use_eu

    def _extract_description(self, payload: dict[str, Any]) -> str:
        """Prefer plain-text fields; fall back to HTML conversion."""
        plain = payload.get("descriptionPlain")
        if isinstance(plain, str) and plain.strip():
            parts = [plain.strip()]
        else:
            html = payload.get("description")
            parts = [html_to_text(html)] if isinstance(html, str) else []

        body_plain = payload.get("descriptionBodyPlain")
        if isinstance(body_plain, str) and body_plain.strip():
            parts.append(body_plain.strip())
        else:
            body_html = payload.get("descriptionBody")
            if isinstance(body_html, str) and body_html.strip():
                parts.append(html_to_text(body_html))

        lists = payload.get("lists")
        if isinstance(lists, list):
            for item in lists:
                if not isinstance(item, dict):
                    continue
                heading = item.get("text")
                content = item.get("content")
                section_bits: list[str] = []
                if isinstance(heading, str) and heading.strip():
                    section_bits.append(heading.strip())
                if isinstance(content, str) and content.strip():
                    # Lever list content is typically HTML.
                    if "<" in content:
                        section_bits.append(html_to_text(content))
                    else:
                        section_bits.append(content.strip())
                if section_bits:
                    parts.append("\n\n".join(section_bits))

        return "\n\n".join(part for part in parts if part).strip()
