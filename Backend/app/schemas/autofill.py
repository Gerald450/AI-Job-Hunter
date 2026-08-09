"""Pydantic schemas for extension profile and AI autofill."""

from __future__ import annotations

from typing import Any, Optional, Union

from pydantic import BaseModel, Field


class ExtensionProfileRequest(BaseModel):
    resumeId: str = Field(..., min_length=1)


class ExtensionUserProfile(BaseModel):
    """Contact / preference profile matching the Chrome extension UserProfile."""

    firstName: Optional[str] = None
    lastName: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    linkedin: Optional[str] = None
    website: Optional[str] = None
    location: Optional[str] = None
    authorizedToWork: Optional[bool] = None
    requiresSponsorship: Optional[bool] = None
    atLeast18: Optional[bool] = None
    desiredSalary: Optional[str] = None
    yearsExperience: Optional[float] = None
    education: Optional[str] = None
    degree: Optional[str] = None
    fieldOfStudy: Optional[str] = None
    graduationDate: Optional[str] = None
    gpa: Optional[str] = None
    preferredLocation: Optional[str] = None
    gender: Optional[str] = None
    veteran: Optional[str] = None
    race: Optional[str] = None
    disability: Optional[str] = None
    hearAboutUs: Optional[str] = None


class UnresolvedField(BaseModel):
    """A form field the rule-based autofill could not confidently fill."""

    uid: Optional[str] = None
    selector: Optional[str] = None
    label: str = ""
    placeholder: Optional[str] = None
    name: Optional[str] = None
    id: Optional[str] = None
    type: Optional[str] = None
    required: bool = False
    options: list[str] = Field(default_factory=list)
    surrounding_text: Optional[str] = None
    nearbyText: Optional[str] = None
    section: Optional[str] = None
    parentSection: Optional[str] = None
    canonicalKey: Optional[str] = None


class AiAutofillJobContext(BaseModel):
    title: Optional[str] = None
    company: Optional[str] = None
    location: Optional[str] = None
    url: Optional[str] = None


class AiAutofillRequest(BaseModel):
    resumeId: str = Field(..., min_length=1)
    fields: list[UnresolvedField] = Field(..., min_length=1)
    profile: Optional[ExtensionUserProfile] = None
    job: Optional[AiAutofillJobContext] = None
    ats: Optional[str] = None


class AiAutofillFieldResult(BaseModel):
    """Single field mapping returned to the extension fill engine."""

    field: str
    uid: Optional[str] = None
    selector: Optional[str] = None
    value: Union[str, bool, int, float]
    # Mapped from LLM profile_field so applyValue/resolveField can use it.
    canonicalKey: Optional[str] = None
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    explanation: Optional[str] = None
    needsReview: bool = False


class AiAutofillResponse(BaseModel):
    values: list[AiAutofillFieldResult] = Field(default_factory=list)


class LlmFieldMapping(BaseModel):
    """Raw LLM field mapping before wire-format normalization."""

    uid: Optional[str] = None
    selector: Optional[str] = None
    field: Optional[str] = None
    value: Any = None
    profile_field: Optional[str] = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    explanation: Optional[str] = None


class LlmAutofillPayload(BaseModel):
    fields: list[LlmFieldMapping] = Field(default_factory=list)
