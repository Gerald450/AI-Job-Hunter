"""Multi-source job discovery providers."""

from sources.aggregation import AggregationStats, JobAggregationService
from sources.base import ListSource, ProviderResult
from sources.registry import build_list_sources

__all__ = [
    "AggregationStats",
    "JobAggregationService",
    "ListSource",
    "ProviderResult",
    "build_list_sources",
]
