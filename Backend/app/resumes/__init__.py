"""Resume upload + serve for the Chrome extension."""

from resumes.storage import ResumeMeta, get_resume, save_resume

__all__ = ["ResumeMeta", "get_resume", "save_resume"]
