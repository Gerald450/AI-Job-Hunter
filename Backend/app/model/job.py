from datetime import datetime, timezone

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
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
