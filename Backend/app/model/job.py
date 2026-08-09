from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class Job(BaseModel):
    company: str
    role: str
    location: str
    apply_url: str
    age: str
    fingerprint: str
    source: str
    faang: bool
    no_sponsorship: bool
    citizenship_required: bool
    closed: bool
    advanced_degree: bool
    # Minimum years of experience parsed from title/description (if any).
    min_years_required: Optional[float] = None
    # Discovery metadata (board sources + classifiers).
    ats: Optional[str] = None
    external_id: Optional[str] = None
    role_family: Optional[str] = None
    is_active: bool = True
    description: Optional[str] = None
    # Populated by the Sponsorship Detection Engine after description fetch.
    sponsorship_available: Optional[bool] = None
    sponsorship_match: Optional[str] = None
    sponsorship_confidence: float = Field(default=0.0, ge=0.0, le=1.0)
