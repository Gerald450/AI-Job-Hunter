"""Conference list-source protocol (sibling to job ListSource)."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable

from model.conference import Conference
from processors.conferences.normalize import normalize_conference


@dataclass
class ConferenceProviderResult:
    provider: str
    conferences: list[Conference] = field(default_factory=list)
    error: str | None = None
    unreliable: bool = False
    elapsed_ms: float = 0.0

    @property
    def ok(self) -> bool:
        return self.error is None


@runtime_checkable
class ConferenceListSource(Protocol):
    name: str

    async def fetch_conferences(self) -> list[Conference]:
        ...


class ConferenceFetcher(ABC):
    """Shared fetch → parse → normalize flow for conference sources."""

    name: str = "unknown"

    @abstractmethod
    async def fetch(self) -> Any:
        """Return raw payload (JSON, markdown, or HTML)."""

    @abstractmethod
    def parse(self, raw: Any) -> list[dict[str, Any]]:
        """Parse raw payload into dicts (not yet Conference)."""

    def normalize(self, item: dict[str, Any]) -> Conference:
        payload = dict(item)
        payload.setdefault("source", self.name)
        return normalize_conference(payload)

    async def fetch_conferences(self) -> list[Conference]:
        raw = await self.fetch()
        conferences: list[Conference] = []
        for item in self.parse(raw):
            try:
                conferences.append(self.normalize(item))
            except Exception:  # noqa: BLE001
                continue
        return conferences
