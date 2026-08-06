"""SimplifyJobs New-Grad-Positions list-source fetcher.

Unlike ATS ``BaseFetcher`` implementations (which enrich a single apply URL),
this module ingests the public GitHub job list and returns normalized ``Job``
records for the aggregation pipeline.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from clients.simplify import fetch_readme
from model.job import Job
from processors.normalize import infer_no_sponsorship, normalize_job
from processors.readme_table import parse_readme_tables

logger = logging.getLogger(__name__)

SOURCE = "simplify"

# Sections to keep from the SimplifyJobs README.
_ALLOWED_SECTIONS = (
    "Software Engineering",
    "Data Science",
    "Machine Learning",
    "AI & Machine Learning",
)

# Titles that clearly are not new-grad / entry-level SWE (or adjacent) roles.
_INTERNSHIP_RE = re.compile(r"(?i)\b(intern(?:ship)?|co-?op)\b")
_MBA_PHD_RE = re.compile(r"(?i)\b(mba|phd)\b")
_SENIOR_RE = re.compile(r"(?i)\b(senior|staff|principal|director|experienced)\b")
_NEW_GRAD_SIGNAL_RE = re.compile(
    r"(?i)(new\s*grad|entry[\s-]*level|early\s*career|junior|university\s*grad|"
    r"recent\s*grad)"
)


class SimplifyFetcher:
    """Fetch, filter, and normalize SimplifyJobs new-grad listings."""

    source: str = SOURCE

    def __init__(
        self,
        *,
        readme_fetcher=fetch_readme,
    ) -> None:
        self._readme_fetcher = readme_fetcher

    def fetch(self) -> list[Job]:
        """Download the README and return normalized ``Job`` objects."""
        content = self._readme_fetcher()
        return self.parse(content)

    def parse(self, content: str) -> list[Job]:
        """Parse README HTML/markdown into filtered, normalized jobs."""
        raw_jobs = parse_readme_tables(
            content,
            source=SOURCE,
            allowed_section_keywords=_ALLOWED_SECTIONS,
            skip_inactive=True,
        )
        total_found = len(raw_jobs)
        logger.info("SimplifyJobs: total jobs found in tables=%s", total_found)

        filtered: list[dict[str, Any]] = []
        skipped = 0
        for job in raw_jobs:
            if self._is_eligible(job):
                filtered.append(job)
            else:
                skipped += 1

        logger.info(
            "SimplifyJobs: eligible after filters=%s skipped=%s",
            len(filtered),
            skipped,
        )

        normalized: list[Job] = []
        errors = 0
        for job in filtered:
            try:
                # Text-based sponsorship inference before emoji normalization.
                notes = job.get("notes") or ""
                role = job.get("role") or ""
                location = job.get("location") or ""
                if infer_no_sponsorship(f"{role} {notes} {location}"):
                    # Seed the flag; normalize_job also checks emoji markers.
                    job["_text_no_sponsorship"] = True
                normalized.append(normalize_job(job))
            except Exception:  # noqa: BLE001
                errors += 1
                logger.exception(
                    "SimplifyJobs: failed to normalize job company=%s role=%s",
                    job.get("company"),
                    job.get("role"),
                )

        logger.info(
            "SimplifyJobs: successfully parsed=%s normalize_errors=%s",
            len(normalized),
            errors,
        )
        return normalized

    def _is_eligible(self, job: dict[str, Any]) -> bool:
        role = (job.get("role") or "").strip()
        if not role:
            return False

        # Always drop internships / co-ops.
        if _INTERNSHIP_RE.search(role):
            return False

        # Drop MBA / PhD-only when not also framed as new grad / entry level.
        if _MBA_PHD_RE.search(role) and not _NEW_GRAD_SIGNAL_RE.search(role):
            return False

        # Drop senior/experienced titles unless they also say new grad.
        if _SENIOR_RE.search(role) and not _NEW_GRAD_SIGNAL_RE.search(role):
            return False

        return True


def fetch_simplify_jobs() -> list[Job]:
    """Convenience entry point used by the aggregation pipeline."""
    return SimplifyFetcher().fetch()
