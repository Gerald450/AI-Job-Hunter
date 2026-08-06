"""Sponsorship Detection Engine — deterministic phrase matching only."""

from sponsorship.detector import SponsorshipDetector, normalize_description
from sponsorship.models import SponsorshipResult
from sponsorship.service import SponsorshipService

__all__ = [
    "SponsorshipDetector",
    "SponsorshipResult",
    "SponsorshipService",
    "normalize_description",
]
