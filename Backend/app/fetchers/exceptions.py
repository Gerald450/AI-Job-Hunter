"""Exceptions raised by the job-description fetching layer."""

from __future__ import annotations


class FetchError(Exception):
    """Raised when a job description cannot be retrieved.

    Typical causes include an invalid URL, an HTTP/API failure,
    an unsupported response shape, or a missing job posting.
    """

    def __init__(self, message: str, *, url: str | None = None) -> None:
        self.url = url
        if url:
            message = f"{message} (url={url})"
        super().__init__(message)
