"""Workday URL parsing and JSON response normalization."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any

from fetchers.exceptions import FetchError
from fetchers.utils import html_to_text, parse_url

logger = logging.getLogger(__name__)

# BCP-47-ish locale segments used on Workday career sites (en-US, fr-FR, …).
_LOCALE_RE = re.compile(r"^[a-z]{2}(?:-[A-Za-z]{2,8})?$")
_TENANT_FROM_HOST_RE = re.compile(
    r"^(?P<tenant>[a-z0-9-]+)(?:\.wd\d+)?\.myworkdayjobs\.com$",
    re.IGNORECASE,
)
# Requisition-style suffixes often appear in the final path segment.
_REQ_ID_RE = re.compile(r"(?:^|[_-])((?:JR|R|REQ)\d+[A-Za-z0-9-]*)$", re.IGNORECASE)

_DESCRIPTION_KEYS = (
    "jobDescription",
    "description",
    "jobDescr",
    "externalJobDescription",
)
_SECTION_KEYS = (
    "responsibilities",
    "qualifications",
    "additionalInformation",
    "additionalJobDescription",
    "aboutUs",
    "companyDescription",
)
_TITLE_KEYS = ("title", "jobTitle", "postingTitle", "name")


@dataclass(frozen=True)
class WorkdayURL:
    """Structured components extracted from a Workday careers job URL."""

    hostname: str
    tenant: str
    site: str
    locale: str | None
    job_id: str
    job_path: str  # e.g. "/job/Seattle-WA/Software-Engineer_R12345"
    original_url: str

    @property
    def base_url(self) -> str:
        return f"https://{self.hostname}"

    @property
    def cxs_prefix(self) -> str:
        """Common CXS API path prefix for this tenant/site."""
        return f"/wday/cxs/{self.tenant}/{self.site}"


@dataclass(frozen=True)
class ParsedWorkdayJob:
    """Normalized fields extracted from a Workday CXS JSON payload."""

    title: str | None
    company: str | None
    description: str
    raw: dict[str, Any]


def parse_workday_url(url: str) -> WorkdayURL:
    """Parse common Workday job-board URL shapes into ``WorkdayURL``.

    Supported examples::

        https://company.wd5.myworkdayjobs.com/en-US/Careers/job/Seattle-WA/Software-Engineer_R12345
        https://company.wd5.myworkdayjobs.com/Careers/job/Software-Engineer_R12345
        https://company.wd5.myworkdayjobs.com/External/job/.../JR12345
    """
    _, host, segments = parse_url(url)
    if "myworkdayjobs.com" not in host and "workday" not in host:
        raise FetchError("Not a Workday URL", url=url)

    tenant = _extract_tenant(host, url)
    locale, rest = _split_locale(segments)
    if len(rest) < 2:
        raise FetchError(
            "Malformed Workday URL: expected /{site}/job/...",
            url=url,
        )

    try:
        job_idx = rest.index("job")
    except ValueError as exc:
        raise FetchError(
            "Malformed Workday URL: missing '/job/' path segment",
            url=url,
        ) from exc

    if job_idx == 0:
        raise FetchError(
            "Malformed Workday URL: missing site name before '/job/'",
            url=url,
        )

    site = rest[0]
    # Site is everything before /job/ (usually a single segment, but keep joined).
    if job_idx > 1:
        site = "/".join(rest[:job_idx])

    job_segments = rest[job_idx:]  # ["job", ...]
    if len(job_segments) < 2:
        raise FetchError(
            "Malformed Workday URL: missing job identifier after '/job/'",
            url=url,
        )

    job_path = "/" + "/".join(job_segments)
    job_id = job_segments[-1]
    if not job_id:
        raise FetchError("Malformed Workday URL: empty job identifier", url=url)

    logger.info(
        "Workday URL parsed: tenant=%s site=%s locale=%s job_id=%s",
        tenant,
        site,
        locale,
        job_id,
    )
    return WorkdayURL(
        hostname=host,
        tenant=tenant,
        site=site,
        locale=locale,
        job_id=job_id,
        job_path=job_path,
        original_url=url,
    )


def extract_requisition_id(job_id: str) -> str | None:
    """Best-effort pull of a requisition id (``R12345``, ``JR12345``, …) from a slug."""
    match = _REQ_ID_RE.search(job_id)
    return match.group(1) if match else None


def normalize_workday_payload(
    payload: dict[str, Any],
    *,
    fallback_company: str | None = None,
) -> ParsedWorkdayJob:
    """Resiliently normalize a Workday CXS JSON payload into job fields.

    Tenants differ in nesting and field names; this walks common shapes and
    merges available description sections into one clean plain-text body.
    """
    info = _unwrap_job_info(payload)
    title = _first_string(info, *_TITLE_KEYS) or _first_string(payload, *_TITLE_KEYS)
    company = _extract_company(payload, info) or fallback_company

    sections: list[str] = []
    for key in _DESCRIPTION_KEYS:
        text = _field_to_text(info.get(key))
        if text:
            sections.append(text)
            break

    for key in _SECTION_KEYS:
        text = _field_to_text(info.get(key))
        if text:
            heading = _humanize_key(key)
            sections.append(f"{heading}\n{text}" if heading else text)

    bullets = _bullet_fields_to_text(info.get("bulletFields"))
    if bullets:
        sections.append(bullets)

    # Some tenants put lists under nested "jobPostingInfo" siblings.
    if not sections:
        for key in _DESCRIPTION_KEYS:
            text = _field_to_text(payload.get(key))
            if text:
                sections.append(text)
                break

    description = "\n\n".join(part for part in sections if part).strip()
    if not description:
        logger.error("Workday parsing failure: no description fields found")
        raise FetchError("Unsupported Workday response: missing job description")

    return ParsedWorkdayJob(
        title=title,
        company=company,
        description=description,
        raw=payload,
    )


def _extract_tenant(host: str, url: str) -> str:
    match = _TENANT_FROM_HOST_RE.match(host)
    if match:
        return match.group("tenant").lower()

    # Rare: myworkdayjobs.com/{tenant}/...
    labels = host.split(".")
    if labels and labels[0] not in {"www", "www2"}:
        return labels[0].lower()

    raise FetchError("Malformed Workday URL: could not extract tenant", url=url)


def _split_locale(segments: list[str]) -> tuple[str | None, list[str]]:
    if segments and _LOCALE_RE.match(segments[0]):
        return segments[0], segments[1:]
    return None, list(segments)


def _unwrap_job_info(payload: dict[str, Any]) -> dict[str, Any]:
    for key in ("jobPostingInfo", "jobPosting", "job", "postingInfo"):
        nested = payload.get(key)
        if isinstance(nested, dict):
            return nested
    return payload


def _extract_company(
    payload: dict[str, Any],
    info: dict[str, Any],
) -> str | None:
    for container in (payload, info):
        org = container.get("hiringOrganization")
        if isinstance(org, dict):
            name = org.get("name")
            if isinstance(name, str) and name.strip():
                return name.strip()
        company = container.get("company")
        if isinstance(company, str) and company.strip():
            return company.strip()
        if isinstance(company, dict):
            name = company.get("name")
            if isinstance(name, str) and name.strip():
                return name.strip()
    return None


def _first_string(data: dict[str, Any], *keys: str) -> str | None:
    for key in keys:
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _field_to_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return ""
        if "<" in stripped or "&lt;" in stripped:
            return html_to_text(stripped)
        return stripped
    if isinstance(value, list):
        parts = [_field_to_text(item) for item in value]
        return "\n".join(part for part in parts if part)
    if isinstance(value, dict):
        # Prefer nested text/html/description values.
        for key in ("text", "html", "description", "value", "content"):
            nested = _field_to_text(value.get(key))
            if nested:
                return nested
        label = value.get("label") or value.get("name")
        body = _field_to_text(value.get("text") or value.get("value"))
        if isinstance(label, str) and label.strip() and body:
            return f"{label.strip()}\n{body}"
    return ""


def _bullet_fields_to_text(value: Any) -> str:
    if not isinstance(value, list) or not value:
        return ""

    parts: list[str] = []
    for item in value:
        if isinstance(item, str) and item.strip():
            text = item.strip()
            parts.append(html_to_text(text) if "<" in text else text)
            continue
        if not isinstance(item, dict):
            continue
        label = item.get("label") or item.get("name") or item.get("descriptor")
        body = (
            item.get("text")
            or item.get("value")
            or item.get("description")
            or item.get("content")
        )
        body_text = _field_to_text(body)
        if isinstance(label, str) and label.strip() and body_text:
            parts.append(f"{label.strip()}\n{body_text}")
        elif body_text:
            parts.append(body_text)
        elif isinstance(label, str) and label.strip():
            parts.append(label.strip())
    return "\n\n".join(parts)


def _humanize_key(key: str) -> str:
    spaced = re.sub(r"([a-z])([A-Z])", r"\1 \2", key)
    return spaced.replace("_", " ").strip().title()
