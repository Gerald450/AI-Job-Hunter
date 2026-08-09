"""Tests for resume upload + serve (Chrome extension flow)."""

from __future__ import annotations

import io
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from resumes.storage import (
    ResumeNotFoundError,
    ResumeValidationError,
    get_resume,
    save_resume,
)


@pytest.fixture
def resume_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setenv("RESUME_STORAGE_DIR", str(tmp_path))
    return tmp_path


@pytest.fixture
def client(resume_dir: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    import api as api_module

    # Avoid requiring Postgres just to exercise resume routes.
    monkeypatch.setattr(api_module, "create_database", lambda: None)
    return TestClient(api_module.app)


def test_save_and_get_resume(resume_dir: Path) -> None:
    pdf = b"%PDF-1.4 fake resume content"
    meta = save_resume(
        filename="Gerald_Shimo_Resume.pdf",
        content=pdf,
        content_type="application/pdf",
    )
    assert meta.resume_id.startswith("resume_")
    assert meta.filename == "Gerald_Shimo_Resume.pdf"
    assert meta.content_type == "application/pdf"
    assert meta.size == len(pdf)

    loaded, data = get_resume(meta.resume_id)
    assert loaded == meta
    assert data == pdf
    assert (resume_dir / meta.resume_id / "meta.json").is_file()


def test_reject_empty_and_bad_type(resume_dir: Path) -> None:
    with pytest.raises(ResumeValidationError, match="empty"):
        save_resume(filename="x.pdf", content=b"")

    with pytest.raises(ResumeValidationError, match="Unsupported"):
        save_resume(filename="notes.txt", content=b"hello")


def test_get_unknown_resume(resume_dir: Path) -> None:
    with pytest.raises(ResumeNotFoundError):
        get_resume("resume_ffffffffffff")


def test_upload_and_download_endpoints(client: TestClient) -> None:
    payload = b"%PDF-1.4 hello from test"
    upload = client.post(
        "/extension/resumes",
        files={
            "file": (
                "Gerald_Shimo_Resume.pdf",
                io.BytesIO(payload),
                "application/pdf",
            )
        },
    )
    assert upload.status_code == 200, upload.text
    body = upload.json()
    assert body["resumeId"].startswith("resume_")
    assert body["filename"] == "Gerald_Shimo_Resume.pdf"
    assert body["contentType"] == "application/pdf"
    assert body["size"] == len(payload)

    download = client.post(
        "/extension/upload",
        json={"resumeId": body["resumeId"]},
    )
    assert download.status_code == 200
    assert download.content == payload
    assert download.headers["content-type"].startswith("application/pdf")


def test_download_missing_resume(client: TestClient) -> None:
    res = client.post(
        "/extension/upload",
        json={"resumeId": "resume_ffffffffffff"},
    )
    assert res.status_code == 404


def test_upload_rejects_txt(client: TestClient) -> None:
    res = client.post(
        "/extension/resumes",
        files={"file": ("notes.txt", io.BytesIO(b"nope"), "text/plain")},
    )
    assert res.status_code == 400
