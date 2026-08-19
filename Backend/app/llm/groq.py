"""Groq OpenAI-compatible chat completions client."""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

import httpx
from llm.base import LLMError, LLMProvider, LLMRateLimitError, LLMTimeoutError
from llm.prompts import (
    MAP_FORM_FIELDS_SYSTEM,
    MATCH_RESUME_SYSTEM,
    PARSE_RESUME_SYSTEM,
    build_map_form_fields_user_prompt,
    build_match_user_prompt,
    build_parse_user_prompt,
)
from schemas.analysis import ParsedResume, ResumeMatchResult

logger = logging.getLogger(__name__)

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_MODEL = "openai/gpt-oss-120b"
DEFAULT_TIMEOUT_S = 60.0
MAX_TEXT_CHARS = 24_000

_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*([\s\S]*?)```", re.IGNORECASE)


def _truncate(text: str, limit: int = MAX_TEXT_CHARS) -> str:
    if len(text) <= limit:
        return text
    return text[: limit - 20] + "\n...[truncated]..."


def _extract_json_object(raw: str) -> dict[str, Any]:
    text = raw.strip()
    fence = _JSON_FENCE_RE.search(text)
    if fence:
        text = fence.group(1).strip()

    try:
        value = json.loads(text)
        if isinstance(value, dict):
            return value
    except json.JSONDecodeError:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        value = json.loads(text[start : end + 1])
        if isinstance(value, dict):
            return value
    raise LLMError("LLM returned malformed JSON")


class GroqProvider(LLMProvider):
    """LLM provider backed by Groq's OpenAI-compatible API."""

    name = "groq"

    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str | None = None,
        timeout: float = DEFAULT_TIMEOUT_S,
    ) -> None:
        self._api_key = api_key or os.getenv("GROQ_API_KEY", "")
        self._model = model or os.getenv("GROQ_MODEL", DEFAULT_MODEL)
        self._timeout = timeout
        if not self._api_key:
            raise LLMError("GROQ_API_KEY is not set")

    async def _chat_json(
        self,
        *,
        system: str,
        user: str,
        temperature: float = 0.1,
    ) -> dict[str, Any]:
        payload = {
            "model": self._model,
            "temperature": temperature,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        last_error: Exception | None = None
        for attempt in range(2):
            try:
                async with httpx.AsyncClient(timeout=self._timeout) as client:
                    response = await client.post(
                        GROQ_API_URL, headers=headers, json=payload
                    )
            except httpx.TimeoutException as exc:
                raise LLMTimeoutError("Groq request timed out") from exc
            except httpx.HTTPError as exc:
                raise LLMError(f"Groq request failed: {exc}") from exc

            if response.status_code == 429:
                if attempt == 0:
                    logger.warning("Groq rate limited; retrying once")
                    continue
                raise LLMRateLimitError("Groq rate limit exceeded")

            if response.status_code >= 400:
                detail = response.text[:500]
                raise LLMError(
                    f"Groq API error {response.status_code}: {detail}"
                )

            try:
                body = response.json()
                content = body["choices"][0]["message"]["content"]
            except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
                raise LLMError("Unexpected Groq response shape") from exc

            try:
                return _extract_json_object(content)
            except (LLMError, json.JSONDecodeError) as exc:
                last_error = exc
                logger.warning(
                    "Malformed Groq JSON on attempt %s: %s", attempt + 1, exc
                )
                continue

        raise LLMError(f"Failed to parse Groq JSON: {last_error}")

    async def parse_resume(self, resume_text: str) -> ParsedResume:
        data = await self._chat_json(
            system=PARSE_RESUME_SYSTEM,
            user=build_parse_user_prompt(_truncate(resume_text)),
        )
        return ParsedResume.model_validate(data)

    async def analyze_resume(
        self,
        *,
        parsed_resume: ParsedResume | dict[str, Any],
        job_title: str,
        company: str,
        location: str,
        description: str,
        sponsorship: dict[str, Any] | None = None,
    ) -> ResumeMatchResult:
        if isinstance(parsed_resume, ParsedResume):
            resume_dict = parsed_resume.model_dump()
        else:
            resume_dict = parsed_resume

        data = await self._chat_json(
            system=MATCH_RESUME_SYSTEM,
            user=build_match_user_prompt(
                parsed_resume=resume_dict,
                job_title=job_title,
                company=company,
                location=location,
                description=_truncate(description),
                sponsorship=sponsorship,
            ),
        )
        # Normalize common alias from the prompt wording.
        if "recommended_improvements" not in data and "recommendations" in data:
            data["recommended_improvements"] = data.pop("recommendations")
        return ResumeMatchResult.model_validate(data)

    async def map_form_fields(
        self,
        *,
        profile: dict[str, Any],
        fields: list[dict[str, Any]],
        job_context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        data = await self._chat_json(
            system=MAP_FORM_FIELDS_SYSTEM,
            user=build_map_form_fields_user_prompt(
                profile=profile,
                fields=fields,
                job_context=job_context,
            ),
            temperature=0.1,
        )
        if "fields" not in data or not isinstance(data.get("fields"), list):
            # Accept a bare list under a common alternate key.
            if isinstance(data.get("mappings"), list):
                data = {"fields": data["mappings"]}
            else:
                data = {"fields": []}
        return data


def get_llm_provider() -> LLMProvider:
    """Factory for the configured LLM provider (currently Groq)."""
    return GroqProvider()
