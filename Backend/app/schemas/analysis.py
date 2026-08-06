"""Pydantic schemas for resume parsing and job match analysis."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class EducationEntry(BaseModel):
    school: str = ""
    degree: str = ""
    field: str = ""
    dates: str = ""


class ExperienceEntry(BaseModel):
    company: str = ""
    title: str = ""
    dates: str = ""
    bullets: list[str] = Field(default_factory=list)


class ProjectEntry(BaseModel):
    name: str = ""
    description: str = ""
    technologies: list[str] = Field(default_factory=list)


class ParsedResume(BaseModel):
    education: list[EducationEntry] = Field(default_factory=list)
    experience: list[ExperienceEntry] = Field(default_factory=list)
    projects: list[ProjectEntry] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    technologies: list[str] = Field(default_factory=list)
    certifications: list[str] = Field(default_factory=list)
    leadership: list[str] = Field(default_factory=list)
    awards: list[str] = Field(default_factory=list)


class ResumeMatchResult(BaseModel):
    overall_match: int = Field(..., ge=0, le=100)
    summary: str = ""
    strengths: list[str] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)
    recommended_improvements: list[str] = Field(default_factory=list)
    matched_keywords: list[str] = Field(default_factory=list)
    missing_keywords: list[str] = Field(default_factory=list)
    confidence: Literal["High", "Medium", "Low"] = "Medium"


class AnalyzeRequest(BaseModel):
    resumeId: str = Field(..., min_length=1)
    refresh: bool = False
    """Optional client-scraped description; preferred when richer than DB."""
    description: Optional[str] = None


class BatchAnalyzeRequest(BaseModel):
    resumeId: str = Field(..., min_length=1)
    jobIds: list[uuid.UUID] = Field(..., min_length=1)
    refresh: bool = False


class ExtensionJobAnalyzeRequest(BaseModel):
    """Job page payload from the Chrome extension (scraped DOM)."""

    url: str = Field(..., min_length=1)
    ats: str = "unknown"
    title: Optional[str] = None
    company: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    requirements: Optional[str] = None
    responsibilities: Optional[str] = None
    employmentType: Optional[str] = None
    remote: Optional[bool] = None
    resumeId: Optional[str] = Field(default=None, min_length=1)
    refresh: bool = False


class ResumeDetailResponse(BaseModel):
    resumeId: str
    filename: str
    contentType: str
    size: int
    parsed: dict[str, Any]
    createdAt: Optional[datetime] = None


class AnalysisResponse(BaseModel):
    id: str
    jobId: str
    resumeId: str
    company: Optional[str] = None
    role: Optional[str] = None
    overall_match: int
    summary: str
    strengths: list[str]
    missing_skills: list[str]
    recommended_improvements: list[str]
    matched_keywords: list[str]
    missing_keywords: list[str]
    confidence: str
    llm_provider: str
    cached: bool = False
    created_at: Optional[datetime] = None
