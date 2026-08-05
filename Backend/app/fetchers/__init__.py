"""Job description fetching layer — Strategy Pattern over ATS public APIs."""

from fetchers.base import BaseFetcher, JobDescription
from fetchers.exceptions import FetchError
from fetchers.router import FetcherRouter

__all__ = [
    "BaseFetcher",
    "FetchError",
    "FetcherRouter",
    "JobDescription",
]
