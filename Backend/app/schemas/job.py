from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, computed_field


def infer_ats_source(apply_url: Optional[str], fallback: str) -> str:
    if not apply_url:
        return fallback

    url = apply_url.lower()
    if "greenhouse" in url or "gh_jid=" in url:
        return "Greenhouse"
    if "lever.co" in url:
        return "Lever"
    if "ashbyhq.com" in url or "ashby" in url:
        return "Ashby"
    if "myworkdayjobs.com" in url or "workday" in url:
        return "Workday"
    if "icims.com" in url:
        return "iCIMS"
    if "smartrecruiters.com" in url:
        return "SmartRecruiters"
    if "jobvite.com" in url:
        return "Jobvite"
    return fallback


class JobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    company: str
    role: str
    location: str
    apply_url: Optional[str]
    age: str
    source: str
    faang: bool
    no_sponsorship: bool
    citizenship_required: bool
    advanced_degree: bool
    closed: bool
    min_years_required: Optional[float] = None
    applied: bool = False
    applied_at: Optional[datetime] = None
    saved: bool = False
    saved_at: Optional[datetime] = None
    flagged: bool = False
    flagged_at: Optional[datetime] = None
    ats: Optional[str] = None
    external_id: Optional[str] = None
    role_family: Optional[str] = None
    is_active: bool = True
    sponsorship_available: Optional[bool] = None
    sponsorship_match: Optional[str] = None
    sponsorship_confidence: float = 0.0
    created_at: datetime
    updated_at: datetime
    # Populated when listing with ?resumeId=… from saved resume_analyses.
    match_score: Optional[int] = None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def ats_source(self) -> str:
        if self.ats:
            return self.ats.title() if self.ats.islower() else self.ats
        return infer_ats_source(self.apply_url, self.source)


class JobStats(BaseModel):
    total: int
    applied: int
    remaining: int
    saved: int = 0
    flagged: int = 0


class JobListResponse(BaseModel):
    jobs: list[JobResponse]
    total: int
    has_more: bool
    stats: JobStats


class AppliedUpdate(BaseModel):
    applied: bool


class SavedUpdate(BaseModel):
    saved: bool


class FlaggedUpdate(BaseModel):
    flagged: bool
