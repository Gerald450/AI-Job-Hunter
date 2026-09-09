"""Community JSON discovery: developers.events / developers-conferences-agenda."""

from __future__ import annotations

from datetime import date
from typing import Any

import httpx

from fetchers.conferences.http import RobotsChecker, get_json
from processors.conferences.dates import parse_iso_date
from sources.conferences.base import ConferenceFetcher

EVENTS_URL = "https://developers.events/all-events.json"
CFPS_URL = "https://developers.events/all-cfps.json"


class DevelopersConferenceFetcher(ConferenceFetcher):
    name = "developers_events"

    def __init__(
        self,
        *,
        client: httpx.AsyncClient | None = None,
        robots: RobotsChecker | None = None,
        delay_ms: int = 0,
    ) -> None:
        self._client = client
        self._robots = robots if robots is not None else RobotsChecker()
        self._delay_ms = delay_ms

    async def fetch(self) -> dict[str, Any]:
        events = await get_json(
            EVENTS_URL,
            client=self._client,
            delay_ms=self._delay_ms,
            robots=self._robots,
        )
        cfps: Any = []
        try:
            cfps = await get_json(
                CFPS_URL,
                client=self._client,
                delay_ms=self._delay_ms,
                robots=self._robots,
            )
        except Exception:  # noqa: BLE001
            cfps = []
        return {"events": events, "cfps": cfps}

    def parse(self, raw: Any) -> list[dict[str, Any]]:
        payload = raw if isinstance(raw, dict) else {"events": raw, "cfps": []}
        events = payload.get("events") or []
        cfps = payload.get("cfps") or []
        cfp_by_url: dict[str, dict[str, Any]] = {}
        if isinstance(cfps, list):
            for item in cfps:
                if not isinstance(item, dict):
                    continue
                url = str(item.get("hyperlink") or item.get("url") or "").strip()
                if url:
                    cfp_by_url[url] = item
        rows: list[dict[str, Any]] = []
        if not isinstance(events, list):
            return rows
        for item in events:
            if not isinstance(item, dict):
                continue
            url = str(item.get("hyperlink") or item.get("url") or "").strip()
            location = item.get("location")
            dates = item.get("date") or []
            start = None
            end = None
            if isinstance(dates, list) and dates:
                start = parse_iso_date(dates[0])
                end = parse_iso_date(dates[-1]) if len(dates) > 1 else start
            event_date = end or start
            if event_date is not None and event_date < date.today():
                continue
            cfp = item.get("cfp") if isinstance(item.get("cfp"), dict) else None
            if cfp is None:
                cfp = cfp_by_url.get(url)
            cfp_until = None
            if isinstance(cfp, dict):
                cfp_until = parse_iso_date(cfp.get("untilDate") or cfp.get("until"))
            status = str(item.get("status") or "unknown").lower()
            if status in {"canceled", "cancelled"}:
                status = "canceled"
            elif status in {"open", "virtualized"}:
                status = "upcoming"
            rows.append(
                {
                    "name": item.get("name"),
                    "location": location,
                    "official_url": url or None,
                    "source": self.name,
                    "source_url": EVENTS_URL,
                    "start_date": start,
                    "end_date": end,
                    "call_for_papers_deadline": cfp_until,
                    "status": status,
                    "is_virtual": str(location or "").lower().startswith("online")
                    or status == "virtualized",
                }
            )
        return rows
