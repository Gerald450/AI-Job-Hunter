"""Resume matching package."""

from matching.service import (
    MISSING_DESCRIPTION_MESSAGE,
    DescriptionMissingError,
    MatchingError,
    MatchingService,
    ingest_resume,
)

__all__ = [
    "MISSING_DESCRIPTION_MESSAGE",
    "DescriptionMissingError",
    "MatchingError",
    "MatchingService",
    "ingest_resume",
]
