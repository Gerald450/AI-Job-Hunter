"""Shared helpers for the job-description fetching layer."""

from __future__ import annotations

import html
import re
from urllib.parse import urlparse

from bs4 import BeautifulSoup, NavigableString, Tag

from fetchers.exceptions import FetchError

_WHITESPACE_RE = re.compile(r"[ \t]+")
_MULTI_NEWLINE_RE = re.compile(r"\n{3,}")
_BLOCK_TAGS = frozenset(
    {
        "p",
        "div",
        "section",
        "article",
        "header",
        "footer",
        "aside",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "tr",
        "blockquote",
        "pre",
        "hr",
    }
)
_LIST_ITEM_TAGS = frozenset({"li"})
_BREAK_TAGS = frozenset({"br"})
_SKIP_TAGS = frozenset({"script", "style", "noscript", "svg", "iframe"})


def html_to_text(html_content: str) -> str:
    """Convert HTML into clean plain text.

    - Strips tags
    - Preserves paragraph breaks
    - Renders list items with a leading ``- ``
    - Collapses excessive whitespace
    """
    if not html_content or not html_content.strip():
        return ""

    # Greenhouse (and others) sometimes return entity-encoded HTML.
    if "&lt;" in html_content and "<" not in html_content[:200]:
        html_content = html.unescape(html_content)

    soup = BeautifulSoup(html_content, "lxml")
    for tag in soup(_SKIP_TAGS):
        tag.decompose()

    chunks: list[str] = []
    _walk(soup.body or soup, chunks)

    text = "".join(chunks)
    text = _WHITESPACE_RE.sub(" ", text)
    text = _MULTI_NEWLINE_RE.sub("\n\n", text)
    return text.strip()


def _walk(node: Tag | NavigableString, chunks: list[str]) -> None:
    if isinstance(node, NavigableString):
        text = str(node)
        if text:
            chunks.append(text)
        return

    if not isinstance(node, Tag):
        return

    name = node.name.lower() if node.name else ""

    if name in _SKIP_TAGS:
        return

    if name in _BREAK_TAGS:
        chunks.append("\n")
        return

    if name == "hr":
        chunks.append("\n\n")
        return

    if name in _LIST_ITEM_TAGS:
        chunks.append("\n- ")
        for child in node.children:
            _walk(child, chunks)
        return

    if name in ("ul", "ol"):
        chunks.append("\n")
        for child in node.children:
            _walk(child, chunks)
        chunks.append("\n")
        return

    for child in node.children:
        _walk(child, chunks)

    if name in _BLOCK_TAGS:
        chunks.append("\n\n")


def parse_url(url: str) -> tuple[str, str, list[str]]:
    """Parse ``url`` into ``(scheme, host, path_segments)``.

    Raises:
        FetchError: If the URL is missing a host or is otherwise malformed.
    """
    if not url or not isinstance(url, str) or not url.strip():
        raise FetchError("Invalid URL: empty or missing", url=url)

    try:
        parsed = urlparse(url.strip())
    except Exception as exc:  # noqa: BLE001 - urlparse rarely raises, but be safe
        raise FetchError(f"Invalid URL: {exc}", url=url) from exc

    host = (parsed.netloc or "").lower()
    if not host:
        raise FetchError("Invalid URL: missing host", url=url)

    path = parsed.path or ""
    segments = [segment for segment in path.split("/") if segment]
    return parsed.scheme or "https", host, segments


def require_path_segments(
    url: str,
    *,
    min_segments: int,
    message: str,
) -> list[str]:
    """Parse ``url`` and require at least ``min_segments`` path parts."""
    _, _, segments = parse_url(url)
    if len(segments) < min_segments:
        raise FetchError(message, url=url)
    return segments
