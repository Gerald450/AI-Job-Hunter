"""Conference processors."""

from processors.conferences.dedupe import deduplicate
from processors.conferences.eligibility import evaluate_conference
from processors.conferences.matching import score_conference
from processors.conferences.normalize import normalize_conference

__all__ = [
    "deduplicate",
    "evaluate_conference",
    "normalize_conference",
    "score_conference",
]
