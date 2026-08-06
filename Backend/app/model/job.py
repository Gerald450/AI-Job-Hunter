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
    # Populated by the Sponsorship Detection Engine after description fetch.
    sponsorship_available: Optional[bool] = None
    sponsorship_match: Optional[str] = None
    sponsorship_confidence: float = Field(default=0.0, ge=0.0, le=1.0)
