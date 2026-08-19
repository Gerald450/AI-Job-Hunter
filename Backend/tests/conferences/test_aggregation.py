"""Aggregation isolation tests with fake conference sources."""

from __future__ import annotations

from processors.conferences.feed import passes_default_feed
from processors.conferences.normalize import normalize_conference
from sources.conferences.aggregation import ConferenceAggregationService


class _OkSource:
    name = "ok"

    async def fetch_conferences(self):
        return [
            normalize_conference(
                {
                    "name": "US Conf",
                    "location": "Boston, MA",
                    "official_url": "https://example.com/us",
                    "source": "ok",
                    "eligibility_requirements": "Open to undergraduate students",
                    "funding_available": True,
                    "travel_grant_available": True,
                }
            ),
            normalize_conference(
                {
                    "name": "London Conf",
                    "location": "London, UK",
                    "official_url": "https://example.com/uk",
                    "source": "ok",
                    "eligibility_requirements": "Open to undergraduate students",
                }
            ),
        ]


class _BoomSource:
    name = "boom"

    async def fetch_conferences(self):
        raise RuntimeError("provider down")


async def test_aggregation_keeps_failures_isolated() -> None:
    service = ConferenceAggregationService(
        sources=[_OkSource(), _BoomSource()],
        profile={
            "country": "United States",
            "graduation_date": "2027-05-31",
            "has_accepted_paper": False,
        },
    )
    conferences, stats = await service.aggregate(verify=False)
    assert len(stats.failures) == 1
    assert stats.failures[0].provider == "boom"
    assert [c.name for c in conferences] == ["US Conf"]
    us = conferences[0]
    assert passes_default_feed(us) is True
