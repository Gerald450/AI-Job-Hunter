"""Pydantic models for sponsorship detection results."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class SponsorshipResult(BaseModel):
    """Outcome of deterministic sponsorship phrase matching.

    ``sponsorship`` values:
    - ``True``: description explicitly offers sponsorship
    - ``False``: description explicitly denies sponsorship
    - ``None``: no explicit sponsorship language found
    """

    sponsorship: Optional[bool] = None
    matched_phrase: Optional[str] = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
