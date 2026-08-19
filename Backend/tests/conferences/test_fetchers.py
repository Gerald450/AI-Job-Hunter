"""Fixture-based conference fetcher tests (no live websites)."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from fetchers.conferences.http import RobotsChecker, get_html
from fetchers.exceptions import FetchError
from sources.conferences.awesome_ai import AwesomeAIConferenceFetcher
from sources.conferences.developers_events import DevelopersConferenceFetcher
from sources.conferences.official import USENIXConferenceFetcher

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures" / "conferences"


def _response(status: int, text: str = "", json_payload=None, url: str = "https://example.com"):
    response = MagicMock(spec=httpx.Response)
    response.status_code = status
    response.url = url
    response.text = text
    response.json.return_value = json_payload
    response.headers = {"content-type": "text/html"}
    return response


@pytest.mark.asyncio
async def test_developers_events_parse() -> None:
    future = int(datetime(2027, 12, 1, tzinfo=timezone.utc).timestamp() * 1000)
    future_end = int(datetime(2027, 12, 3, tzinfo=timezone.utc).timestamp() * 1000)
    cfp = int(datetime(2027, 6, 1, tzinfo=timezone.utc).timestamp() * 1000)
    past = int(datetime(2025, 1, 15, tzinfo=timezone.utc).timestamp() * 1000)
    payload = {
        "events": [
            {
                "name": "Strange Loop",
                "date": [future, future_end],
                "hyperlink": "https://thestrangeloop.com/",
                "location": "St. Louis (USA)",
                "status": "open",
                "cfp": {"untilDate": cfp},
            },
            {
                "name": "DevFest Paris",
                "date": [future],
                "hyperlink": "https://devfest.paris/",
                "location": "Paris (France)",
                "status": "open",
            },
            {
                "name": "Old Summit",
                "date": [past],
                "hyperlink": "https://example.com/old",
                "location": "Austin (USA)",
                "status": "open",
            },
        ],
        "cfps": [],
    }
    fetcher = DevelopersConferenceFetcher()
    rows = fetcher.parse(payload)
    assert len(rows) == 2
    assert all(item["name"] != "Old Summit" for item in rows)
    us = next(item for item in rows if "Strange" in item["name"])
    assert us["official_url"] == "https://thestrangeloop.com/"
    conferences = [fetcher.normalize(row) for row in rows]
    assert any(c.location_status.value == "US" for c in conferences)
    assert any(c.location_status.value == "NON_US" for c in conferences)


def test_awesome_ai_markdown_parse() -> None:
    markdown = (FIXTURES / "awesome_ai.md").read_text(encoding="utf-8")
    fetcher = AwesomeAIConferenceFetcher()
    rows = fetcher.parse(markdown)
    names = [row["name"] for row in rows]
    assert "NeurIPS" in names
    assert "AAAI Conference on AI" in names
    neurips = next(row for row in rows if row["name"] == "NeurIPS")
    assert neurips["year"] == 2025
    conf = fetcher.normalize(neurips)
    assert conf.location_status.value == "US"


def test_usenix_table_parse() -> None:
    html = (FIXTURES / "usenix.html").read_text(encoding="utf-8")
    fetcher = USENIXConferenceFetcher()
    rows = fetcher.parse(html)
    assert rows
    seattle = next(row for row in rows if "FAST" in row["name"])
    assert "Seattle" in (seattle.get("location") or "")
    conf = fetcher.normalize(seattle)
    assert conf.organization == "USENIX"
    assert conf.location_status.value == "US"


@pytest.mark.asyncio
async def test_robots_disallowed(monkeypatch: pytest.MonkeyPatch) -> None:
    checker = RobotsChecker()
    robots_txt = "User-agent: *\nDisallow: /secret\n"
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get.return_value = _response(200, robots_txt, url="https://example.com/robots.txt")
    allowed = await checker.allowed("https://example.com/secret", client)
    assert allowed is False
    allowed_ok = await checker.allowed("https://example.com/open", client)
    assert allowed_ok is True

    with pytest.raises(FetchError, match="Disallowed"):
        await get_html(
            "https://example.com/secret",
            client=client,
            delay_ms=0,
            robots=checker,
        )
