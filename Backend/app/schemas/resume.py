from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class ResumeUploadResponse(BaseModel):
    resumeId: str
    filename: str
    contentType: str
    size: int
    parsed: Optional[dict[str, Any]] = None


class ResumeDownloadRequest(BaseModel):
    resumeId: str = Field(..., min_length=1, description="ID returned from upload")
