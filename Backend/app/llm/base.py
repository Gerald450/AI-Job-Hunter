"""Abstract LLM provider interface for future-compatible AI features."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from schemas.analysis import ParsedResume, ResumeMatchResult


class LLMError(Exception):
    """Base error for LLM provider failures."""


class LLMTimeoutError(LLMError):
    """Raised when the LLM request times out."""


class LLMRateLimitError(LLMError):
    """Raised when the provider returns HTTP 429."""


class LLMProvider(ABC):
    """Swap-friendly interface for resume and job AI tasks.

    Future methods (cover letters, interview questions, etc.) can be added
    here without changing call sites that depend on this ABC.
    """

    name: str = "base"

    @abstractmethod
    async def parse_resume(self, resume_text: str) -> ParsedResume:
        """Extract structured fields from raw resume text."""

    @abstractmethod
    async def analyze_resume(
        self,
        *,
        parsed_resume: ParsedResume | dict[str, Any],
        job_title: str,
        company: str,
        location: str,
        description: str,
    ) -> ResumeMatchResult:
        """Score resume alignment against a job description."""
