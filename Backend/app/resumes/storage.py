"""Filesystem-backed resume storage.

Each resume lives under ``RESUME_STORAGE_DIR/<resumeId>/`` with the uploaded
binary and a small ``meta.json`` sidecar. Optional ``text.txt`` / ``parsed.json``
sidecars cache extraction and structured parse results. IDs look like
``resume_a1b2c3d4e5f6`` so they paste cleanly into the Chrome extension Options.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import uuid
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

ALLOWED_EXTENSIONS = {".pdf", ".doc", ".docx"}

# 10 MiB — typical resumes are well under this.
MAX_RESUME_BYTES = 10 * 1024 * 1024

_RESUME_ID_RE = re.compile(r"^resume_[0-9a-f]{12}$")


@dataclass(frozen=True)
class ResumeMeta:
    resume_id: str
    filename: str
    content_type: str
    size: int


class ResumeNotFoundError(LookupError):
    pass


class ResumeValidationError(ValueError):
    pass


def storage_root() -> Path:
    raw = os.getenv("RESUME_STORAGE_DIR")
    if raw:
        return Path(raw).expanduser().resolve()
    # Backend/app/resumes/storage.py → Backend/data/resumes
    return Path(__file__).resolve().parents[2] / "data" / "resumes"


def content_hash(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _meta_path(resume_id: str) -> Path:
    return storage_root() / resume_id / "meta.json"


def _file_path(resume_id: str, filename: str) -> Path:
    return storage_root() / resume_id / filename


def _text_path(resume_id: str) -> Path:
    return storage_root() / resume_id / "text.txt"


def _parsed_path(resume_id: str) -> Path:
    return storage_root() / resume_id / "parsed.json"


def _safe_filename(name: str) -> str:
    base = Path(name or "resume.pdf").name.strip() or "resume.pdf"
    # Strip path traversal / control characters; keep a readable name.
    cleaned = re.sub(r"[^\w.\- ()\[\]]+", "_", base).strip("._")
    return cleaned or "resume.pdf"


def _guess_content_type(filename: str, provided: str | None) -> str:
    if provided and provided in ALLOWED_CONTENT_TYPES:
        return provided
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        return "application/pdf"
    if ext == ".doc":
        return "application/msword"
    if ext == ".docx":
        return (
            "application/vnd.openxmlformats-officedocument."
            "wordprocessingml.document"
        )
    raise ResumeValidationError(
        f"Unsupported resume type (extension {ext or 'unknown'}). "
        "Upload a PDF, DOC, or DOCX."
    )


def new_resume_id() -> str:
    return f"resume_{uuid.uuid4().hex[:12]}"


def save_resume(
    *,
    filename: str,
    content: bytes,
    content_type: str | None = None,
) -> ResumeMeta:
    if not content:
        raise ResumeValidationError("Resume file is empty")
    if len(content) > MAX_RESUME_BYTES:
        raise ResumeValidationError(
            f"Resume exceeds {MAX_RESUME_BYTES // (1024 * 1024)} MiB limit"
        )

    safe_name = _safe_filename(filename)
    ext = Path(safe_name).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ResumeValidationError(
            "Unsupported resume type. Upload a PDF, DOC, or DOCX."
        )

    ctype = _guess_content_type(safe_name, content_type)
    resume_id = new_resume_id()
    directory = storage_root() / resume_id
    directory.mkdir(parents=True, exist_ok=True)

    file_path = _file_path(resume_id, safe_name)
    file_path.write_bytes(content)

    meta = ResumeMeta(
        resume_id=resume_id,
        filename=safe_name,
        content_type=ctype,
        size=len(content),
    )
    _meta_path(resume_id).write_text(
        json.dumps(asdict(meta), indent=2),
        encoding="utf-8",
    )
    return meta


def get_resume(resume_id: str) -> tuple[ResumeMeta, bytes]:
    if not resume_id or not _RESUME_ID_RE.match(resume_id):
        raise ResumeNotFoundError("Resume not found")

    meta_file = _meta_path(resume_id)
    if not meta_file.is_file():
        raise ResumeNotFoundError("Resume not found")

    raw = json.loads(meta_file.read_text(encoding="utf-8"))
    meta = ResumeMeta(
        resume_id=raw["resume_id"],
        filename=raw["filename"],
        content_type=raw["content_type"],
        size=int(raw["size"]),
    )
    path = _file_path(resume_id, meta.filename)
    if not path.is_file():
        raise ResumeNotFoundError("Resume file missing on disk")

    data = path.read_bytes()
    return meta, data


def save_resume_text(resume_id: str, text: str) -> None:
    _text_path(resume_id).write_text(text, encoding="utf-8")


def get_resume_text(resume_id: str) -> str | None:
    path = _text_path(resume_id)
    if not path.is_file():
        return None
    return path.read_text(encoding="utf-8")


def save_parsed_resume(resume_id: str, parsed: dict[str, Any]) -> None:
    _parsed_path(resume_id).write_text(
        json.dumps(parsed, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def get_parsed_resume(resume_id: str) -> dict[str, Any] | None:
    path = _parsed_path(resume_id)
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))
