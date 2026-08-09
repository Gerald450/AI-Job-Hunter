"""Rewrite known-broken ATS apply URLs into direct job links."""

from __future__ import annotations

import re
from urllib.parse import parse_qs, urlparse

_STRIPE_SEARCH_HOSTS = {"stripe.com", "www.stripe.com"}
_STRIPE_SEARCH_PATHS = {"/jobs/search", "/careers/search"}
_NON_ALNUM_RE = re.compile(r"[^a-z0-9]+")


def slugify_role(title: str) -> str:
    """Turn a job title into a URL slug (Stripe listing path segment)."""
    slug = _NON_ALNUM_RE.sub("-", (title or "").lower()).strip("-")
    return slug or "job"


def rewrite_apply_url(
    url: str,
    *,
    role: str | None = None,
    external_id: str | None = None,
) -> str:
    """Fix company career-site search deep-links that dump users on a job board.

    Stripe's Greenhouse ``absolute_url`` is often
    ``https://stripe.com/jobs/search?gh_jid=…`` (or ``/careers/search``), which
    loads the search UI instead of the posting. The working deep link is
    ``https://stripe.com/jobs/listing/{slug}/{id}``.
    """
    raw = (url or "").strip()
    if not raw:
        return raw

    try:
        parsed = urlparse(raw)
    except Exception:  # noqa: BLE001
        return raw

    host = (parsed.hostname or "").lower()
    path = (parsed.path or "").rstrip("/") or "/"
    if host not in _STRIPE_SEARCH_HOSTS:
        return raw
    if path not in _STRIPE_SEARCH_PATHS:
        return raw

    query = parse_qs(parsed.query or "")
    job_ids = query.get("gh_jid") or []
    job_id = (external_id or (job_ids[0] if job_ids else "")).strip()
    if not job_id or not job_id.isdigit():
        return raw

    slug = slugify_role(role or "")
    return f"https://stripe.com/jobs/listing/{slug}/{job_id}"
