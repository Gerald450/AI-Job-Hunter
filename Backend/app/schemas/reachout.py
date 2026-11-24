from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ContactResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    company: str
    role: str
    why: str
    importance: int
    reached_out: bool
    responded: bool
    followed_up: bool
    followed_up_manual: bool
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def enforce_follow_up_rule(self) -> "ContactResponse":
        """Responded implies reached out and followed up. Otherwise follow-up is manual."""
        if self.responded:
            self.reached_out = True
            self.followed_up = True
        else:
            self.followed_up = self.followed_up_manual
        return self


class ReachoutStats(BaseModel):
    total: int
    reached_out: int
    responded: int
    needs_follow_up: int


class ContactListResponse(BaseModel):
    contacts: list[ContactResponse]
    total: int
    has_more: bool
    stats: ReachoutStats


class CompanyListResponse(BaseModel):
    companies: list[str]


class ContactCreate(BaseModel):
    name: str = Field(min_length=1, max_length=300)
    company: str = Field(min_length=1, max_length=300)
    role: str = Field(min_length=1, max_length=2000)
    why: str = Field(default="", max_length=4000)
    importance: int = Field(ge=0, le=100)

    @field_validator("name", "company", "role", "why")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()

    @model_validator(mode="after")
    def require_name_company_role(self) -> "ContactCreate":
        if not self.name or not self.company or not self.role:
            raise ValueError("name, company, and role are required")
        return self


class ContactUpdate(BaseModel):
    reached_out: Optional[bool] = None
    responded: Optional[bool] = None
    followed_up: Optional[bool] = None
    notes: Optional[str] = Field(default=None, max_length=8000)

    @field_validator("notes")
    @classmethod
    def strip_notes(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        return value.strip()
