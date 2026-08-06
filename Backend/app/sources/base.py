"""List-source discovery interface (board / repo aggregation).

Distinct from ``fetchers.base.BaseFetcher``, which fetches a single job
*description* for enrichment.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable

from model.job import Job


@dataclass
class ProviderResult:
    """Outcome of one list-source fetch."""

    provider: str
    jobs: list[Job] = field(default_factory=list)
    error: str | None = None
    elapsed_ms: float = 0.0

    @property
    def ok(self) -> bool:
        return self.error is None


@runtime_checkable
class ListSource(Protocol):
    """Async discovery source that returns normalized ``Job`` records."""

    name: str

    async def fetch_jobs(self) -> list[Job]:
        """Fetch and return jobs from this provider."""
        ...
