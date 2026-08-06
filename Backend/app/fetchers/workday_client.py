"""Workday CXS HTTP client with pluggable endpoint strategies."""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, ClassVar

import httpx

from fetchers.base import DEFAULT_HEADERS, DEFAULT_TIMEOUT
from fetchers.exceptions import FetchError
from fetchers.workday_parser import WorkdayURL, extract_requisition_id

logger = logging.getLogger(__name__)

_JSON_HEADERS = {
    **DEFAULT_HEADERS,
    "Accept": "application/json",
    "Content-Type": "application/json",
}
_SEARCH_BODY = {"appliedFacets": {}, "limit": 20, "offset": 0, "searchText": ""}
_RETRYABLE_STATUS = frozenset({408, 425, 429, 500, 502, 503, 504})
_DEFAULT_MAX_RETRIES = 2


@dataclass(frozen=True)
class WorkdayApiResult:
    """Successful CXS response plus metadata about how it was obtained."""

    payload: dict[str, Any]
    endpoint: str
    pattern_name: str


class TenantPatternCache:
    """In-memory map of Workday tenant → successful endpoint pattern name.

    Designed so a durable backend (DB, Redis) can replace this later without
    changing ``WorkdayClient`` call sites.
    """

    def __init__(self) -> None:
        self._patterns: dict[str, str] = {}

    def get(self, tenant: str) -> str | None:
        return self._patterns.get(tenant.lower())

    def set(self, tenant: str, pattern_name: str) -> None:
        key = tenant.lower()
        self._patterns[key] = pattern_name
        logger.info("Cached Workday pattern for tenant=%s → %s", key, pattern_name)

    def invalidate(self, tenant: str) -> None:
        self._patterns.pop(tenant.lower(), None)

    def as_dict(self) -> dict[str, str]:
        return dict(self._patterns)


class EndpointStrategy(ABC):
    """Pluggable CXS endpoint pattern. Register new subclasses to extend coverage."""

    name: ClassVar[str]

    @abstractmethod
    async def attempt(
        self,
        client: WorkdayClient,
        parsed: WorkdayURL,
    ) -> WorkdayApiResult | None:
        """Try this pattern. Return a result on success, or ``None`` to continue."""


class DirectJobGetFullPathStrategy(EndpointStrategy):
    """GET ``/wday/cxs/{tenant}/{site}{job_path}`` using the full URL job path."""

    name: ClassVar[str] = "cxs_job_get_full_path"

    async def attempt(
        self,
        client: WorkdayClient,
        parsed: WorkdayURL,
    ) -> WorkdayApiResult | None:
        endpoint = f"{parsed.base_url}{parsed.cxs_prefix}{parsed.job_path}"
        return await client._get_job_json(endpoint, self.name)


class DirectJobGetSlugStrategy(EndpointStrategy):
    """GET ``/wday/cxs/{tenant}/{site}/job/{job_id}`` using only the final slug."""

    name: ClassVar[str] = "cxs_job_get_slug"

    async def attempt(
        self,
        client: WorkdayClient,
        parsed: WorkdayURL,
    ) -> WorkdayApiResult | None:
        endpoint = f"{parsed.base_url}{parsed.cxs_prefix}/job/{parsed.job_id}"
        if endpoint.endswith(parsed.job_path):
            # Already covered by the full-path strategy when path == /job/{id}.
            return None
        return await client._get_job_json(endpoint, self.name)


class DirectJobPostByIdStrategy(EndpointStrategy):
    """POST ``/wday/cxs/{tenant}/{site}/job/{job_id}`` (tenant-specific variants)."""

    name: ClassVar[str] = "cxs_job_post_by_id"

    async def attempt(
        self,
        client: WorkdayClient,
        parsed: WorkdayURL,
    ) -> WorkdayApiResult | None:
        endpoint = f"{parsed.base_url}{parsed.cxs_prefix}/job/{parsed.job_id}"
        return await client._post_job_json(endpoint, self.name, body={})


class JobsSearchStrategy(EndpointStrategy):
    """POST ``/wday/cxs/{tenant}/{site}/jobs`` then GET the matched posting detail."""

    name: ClassVar[str] = "cxs_jobs_search"

    async def attempt(
        self,
        client: WorkdayClient,
        parsed: WorkdayURL,
    ) -> WorkdayApiResult | None:
        search_terms = [parsed.job_id]
        req_id = extract_requisition_id(parsed.job_id)
        if req_id and req_id not in search_terms:
            search_terms.append(req_id)

        list_endpoint = f"{parsed.base_url}{parsed.cxs_prefix}/jobs"
        for term in search_terms:
            body = {**_SEARCH_BODY, "searchText": term}
            logger.info(
                "Workday search attempt: endpoint=%s searchText=%s",
                list_endpoint,
                term,
            )
            response = await client._request("POST", list_endpoint, json_body=body)
            if response is None or response.status_code != 200:
                continue

            try:
                payload = response.json()
            except ValueError:
                logger.error("Malformed Workday search response: %s", list_endpoint)
                continue

            if not isinstance(payload, dict):
                continue

            external_path = _find_external_path(payload, parsed.job_id, req_id)
            if not external_path:
                continue

            detail_endpoint = (
                f"{parsed.base_url}{parsed.cxs_prefix}{external_path}"
            )
            result = await client._get_job_json(detail_endpoint, self.name)
            if result is not None:
                return result
        return None


class LocaleVariantSearchStrategy(EndpointStrategy):
    """Retry the jobs-search pattern with locale-flavoured site aliases.

    Some tenants publish locale-prefixed public URLs while the CXS site slug
    differs slightly; this probes a small set of safe site variants.
    """

    name: ClassVar[str] = "cxs_locale_site_variants"

    async def attempt(
        self,
        client: WorkdayClient,
        parsed: WorkdayURL,
    ) -> WorkdayApiResult | None:
        variants = _site_variants(parsed)
        if not variants:
            return None

        for site in variants:
            variant = WorkdayURL(
                hostname=parsed.hostname,
                tenant=parsed.tenant,
                site=site,
                locale=parsed.locale,
                job_id=parsed.job_id,
                job_path=parsed.job_path,
                original_url=parsed.original_url,
            )
            logger.info(
                "Workday locale/site variant attempt: site=%s",
                site,
            )
            # Prefer direct GET with the variant site before searching.
            for strategy in (
                DirectJobGetFullPathStrategy(),
                JobsSearchStrategy(),
            ):
                result = await strategy.attempt(client, variant)
                if result is not None:
                    return WorkdayApiResult(
                        payload=result.payload,
                        endpoint=result.endpoint,
                        pattern_name=self.name,
                    )
        return None


DEFAULT_STRATEGIES: tuple[EndpointStrategy, ...] = (
    DirectJobGetFullPathStrategy(),
    DirectJobGetSlugStrategy(),
    DirectJobPostByIdStrategy(),
    JobsSearchStrategy(),
    LocaleVariantSearchStrategy(),
)


class WorkdayClient:
    """Communicate with Workday CXS endpoints using registered strategies."""

    def __init__(
        self,
        client: httpx.AsyncClient | None = None,
        *,
        timeout: httpx.Timeout | None = None,
        pattern_cache: TenantPatternCache | None = None,
        strategies: tuple[EndpointStrategy, ...] | None = None,
        max_retries: int = _DEFAULT_MAX_RETRIES,
    ) -> None:
        self._client = client
        self._timeout = timeout or DEFAULT_TIMEOUT
        self._pattern_cache = pattern_cache or TenantPatternCache()
        self._strategies = strategies or DEFAULT_STRATEGIES
        self._strategy_by_name = {s.name: s for s in self._strategies}
        self._max_retries = max_retries

    @property
    def pattern_cache(self) -> TenantPatternCache:
        return self._pattern_cache

    def register_strategy(self, strategy: EndpointStrategy) -> None:
        """Append a new endpoint pattern without modifying existing strategies."""
        if strategy.name in self._strategy_by_name:
            raise ValueError(f"Strategy already registered: {strategy.name}")
        self._strategies = (*self._strategies, strategy)
        self._strategy_by_name[strategy.name] = strategy

    async def fetch_job(self, parsed: WorkdayURL) -> WorkdayApiResult:
        """Probe endpoint patterns until one returns a usable job payload."""
        logger.info(
            "Workday client: tenant=%s site=%s job_id=%s",
            parsed.tenant,
            parsed.site,
            parsed.job_id,
        )

        ordered = self._ordered_strategies(parsed.tenant)
        last_error: Exception | None = None
        saw_forbidden = False
        saw_not_found = False

        for strategy in ordered:
            logger.info(
                "Workday attempting endpoint pattern: %s",
                strategy.name,
            )
            try:
                result = await strategy.attempt(self, parsed)
            except FetchError as exc:
                last_error = exc
                message = str(exc).lower()
                if "403" in message or "forbidden" in message:
                    saw_forbidden = True
                if "404" in message or "not found" in message:
                    saw_not_found = True
                logger.info(
                    "Workday pattern %s raised: %s",
                    strategy.name,
                    exc,
                )
                continue

            if result is None:
                logger.info("Workday pattern %s: no match", strategy.name)
                continue

            self._pattern_cache.set(parsed.tenant, strategy.name)
            logger.info(
                "Workday endpoint selected: pattern=%s endpoint=%s",
                result.pattern_name,
                result.endpoint,
            )
            logger.info(
                "Workday fetch success: tenant=%s job_id=%s",
                parsed.tenant,
                parsed.job_id,
            )
            return result

        if saw_forbidden and not saw_not_found:
            raise FetchError(
                "Workday API request forbidden (403)",
                url=parsed.original_url,
            ) from last_error

        raise FetchError(
            "Workday job not found via CXS API",
            url=parsed.original_url,
        ) from last_error

    def _ordered_strategies(self, tenant: str) -> list[EndpointStrategy]:
        cached = self._pattern_cache.get(tenant)
        if not cached:
            return list(self._strategies)

        preferred = self._strategy_by_name.get(cached)
        if preferred is None:
            self._pattern_cache.invalidate(tenant)
            return list(self._strategies)

        rest = [s for s in self._strategies if s.name != preferred.name]
        logger.info(
            "Workday using cached pattern first: tenant=%s pattern=%s",
            tenant,
            preferred.name,
        )
        return [preferred, *rest]

    async def _get_job_json(
        self,
        endpoint: str,
        pattern_name: str,
    ) -> WorkdayApiResult | None:
        response = await self._request("GET", endpoint)
        return self._result_from_response(response, endpoint, pattern_name)

    async def _post_job_json(
        self,
        endpoint: str,
        pattern_name: str,
        *,
        body: dict[str, Any],
    ) -> WorkdayApiResult | None:
        response = await self._request("POST", endpoint, json_body=body)
        return self._result_from_response(response, endpoint, pattern_name)

    def _result_from_response(
        self,
        response: httpx.Response | None,
        endpoint: str,
        pattern_name: str,
    ) -> WorkdayApiResult | None:
        if response is None:
            return None
        if response.status_code == 404:
            logger.info("Workday 404 at %s", endpoint)
            return None
        if response.status_code == 403:
            logger.error("Workday 403 Forbidden at %s", endpoint)
            raise FetchError(
                "Workday API request forbidden (403)",
                url=endpoint,
            )
        if response.status_code >= 400:
            logger.info(
                "Workday HTTP %s at %s",
                response.status_code,
                endpoint,
            )
            return None

        try:
            payload = response.json()
        except ValueError:
            logger.error("Malformed Workday JSON response: %s", endpoint)
            return None

        if not isinstance(payload, dict) or not _looks_like_job_payload(payload):
            logger.info("Workday response not a job payload: %s", endpoint)
            return None

        return WorkdayApiResult(
            payload=payload,
            endpoint=endpoint,
            pattern_name=pattern_name,
        )

    async def _request(
        self,
        method: str,
        endpoint: str,
        *,
        json_body: dict[str, Any] | None = None,
    ) -> httpx.Response | None:
        logger.info("Workday API request: %s %s", method, endpoint)
        last_exc: Exception | None = None

        for attempt in range(self._max_retries + 1):
            try:
                response = await self._send(method, endpoint, json_body=json_body)
            except httpx.TimeoutException as exc:
                last_exc = exc
                logger.error(
                    "Workday request timed out (%s/%s): %s",
                    attempt + 1,
                    self._max_retries + 1,
                    endpoint,
                )
                continue
            except httpx.RequestError as exc:
                last_exc = exc
                logger.error(
                    "Workday request failed (%s/%s): %s (%s)",
                    attempt + 1,
                    self._max_retries + 1,
                    endpoint,
                    exc,
                )
                continue

            if response.status_code in _RETRYABLE_STATUS and attempt < self._max_retries:
                logger.info(
                    "Workday retryable status %s for %s; retrying",
                    response.status_code,
                    endpoint,
                )
                continue
            return response

        if last_exc is not None:
            raise FetchError(
                f"Workday request failed: {last_exc}",
                url=endpoint,
            ) from last_exc
        return None

    async def _send(
        self,
        method: str,
        endpoint: str,
        *,
        json_body: dict[str, Any] | None,
    ) -> httpx.Response:
        kwargs: dict[str, Any] = {"headers": _JSON_HEADERS}
        if json_body is not None:
            kwargs["json"] = json_body

        if self._client is not None:
            return await self._client.request(method, endpoint, **kwargs)

        async with httpx.AsyncClient(
            timeout=self._timeout,
            follow_redirects=True,
            headers=DEFAULT_HEADERS,
        ) as client:
            return await client.request(method, endpoint, **kwargs)


def _looks_like_job_payload(payload: dict[str, Any]) -> bool:
    if any(
        key in payload
        for key in (
            "jobPostingInfo",
            "jobPosting",
            "jobDescription",
            "description",
            "title",
            "jobTitle",
        )
    ):
        return True
    info = payload.get("jobPostingInfo")
    return isinstance(info, dict)


def _find_external_path(
    search_payload: dict[str, Any],
    job_id: str,
    req_id: str | None,
) -> str | None:
    postings = search_payload.get("jobPostings")
    if not isinstance(postings, list):
        return None

    job_id_l = job_id.lower()
    req_l = req_id.lower() if req_id else None

    for posting in postings:
        if not isinstance(posting, dict):
            continue
        path = posting.get("externalPath")
        if not isinstance(path, str) or not path:
            continue
        path_l = path.lower()
        if job_id_l in path_l or (req_l and req_l in path_l):
            return path if path.startswith("/") else f"/{path}"

        # Some tenants only echo the slug in title / bulletFields.
        title = posting.get("title")
        if isinstance(title, str) and job_id_l in title.lower():
            return path if path.startswith("/") else f"/{path}"

    return None


def _site_variants(parsed: WorkdayURL) -> list[str]:
    """Generate alternate site slugs to try when the primary site fails."""
    variants: list[str] = []
    site = parsed.site
    candidates = [
        f"{site}_External",
        f"{site}External",
        "External",
        "Careers",
        "career",
    ]

    seen = {site.lower()}
    for candidate in candidates:
        key = candidate.lower()
        if key not in seen:
            seen.add(key)
            variants.append(candidate)
    return variants
