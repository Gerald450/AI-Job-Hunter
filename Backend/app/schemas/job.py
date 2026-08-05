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
    created_at: datetime
    updated_at: datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def ats_source(self) -> str:
        return infer_ats_source(self.apply_url, self.source)
