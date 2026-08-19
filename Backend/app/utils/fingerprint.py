import hashlib
from datetime import date
from typing import Optional
from urllib.parse import urlparse


def create_fingerprint(job):

    raw = f"{job['company']}|{job['role']}|{job['location']}|{job['apply_url']}"

    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def canonicalize_url(url: Optional[str]) -> str:
    """Lowercase host, strip www/trailing slash/query/fragment."""
    if not url or not isinstance(url, str):
        return ""
    text = url.strip()
    if not text:
        return ""
    parsed = urlparse(text)
    host = (parsed.netloc or "").lower()
    if host.startswith("www."):
        host = host[4:]
    path = (parsed.path or "").rstrip("/")
    if not host:
        return text.lower().rstrip("/")
    return f"{host}{path}"


def create_conference_fingerprint(
    *,
    name: str,
    organization: Optional[str] = None,
    start_date: Optional[date] = None,
    city: Optional[str] = None,
    official_url: Optional[str] = None,
) -> str:
    canonical = canonicalize_url(official_url)
    if canonical:
        raw = f"url|{canonical}"
    else:
        raw = (
            f"{(name or '').strip().lower()}|"
            f"{(organization or '').strip().lower()}|"
            f"{start_date.isoformat() if start_date else ''}|"
            f"{(city or '').strip().lower()}"
        )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
