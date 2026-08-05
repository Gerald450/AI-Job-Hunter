"""Tests for html_to_text and URL helpers."""

from __future__ import annotations

import pytest

from fetchers.exceptions import FetchError
from fetchers.utils import html_to_text, parse_url


def test_html_to_text_strips_tags_and_preserves_paragraphs() -> None:
    html = "<p>Hello world.</p><p>Second paragraph.</p>"
    text = html_to_text(html)
    assert "Hello world." in text
    assert "Second paragraph." in text
    assert "<p>" not in text
    assert "\n" in text


def test_html_to_text_preserves_bullet_points() -> None:
    html = "<ul><li>Python</li><li>SQL</li><li>AWS</li></ul>"
    text = html_to_text(html)
    assert "- Python" in text
    assert "- SQL" in text
    assert "- AWS" in text


def test_html_to_text_strips_excessive_whitespace() -> None:
    html = "<p>Too    many     spaces</p><p></p><p></p><p>ok</p>"
    text = html_to_text(html)
    assert "Too many spaces" in text
    assert "\n\n\n" not in text


def test_html_to_text_unescapes_entity_encoded_html() -> None:
    html = "&lt;p&gt;Encoded&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Item&lt;/li&gt;&lt;/ul&gt;"
    text = html_to_text(html)
    assert "Encoded" in text
    assert "- Item" in text
    assert "&lt;" not in text


def test_html_to_text_empty_input() -> None:
    assert html_to_text("") == ""
    assert html_to_text("   ") == ""


def test_parse_url_valid() -> None:
    scheme, host, segments = parse_url("https://jobs.lever.co/acme/abc123")
    assert scheme == "https"
    assert host == "jobs.lever.co"
    assert segments == ["acme", "abc123"]


@pytest.mark.parametrize("url", ["", "not-a-url", "/no/host"])
def test_parse_url_invalid(url: str) -> None:
    with pytest.raises(FetchError):
        parse_url(url)
