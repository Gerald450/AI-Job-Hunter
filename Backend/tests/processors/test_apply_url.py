"""Tests for apply URL rewriting."""

from __future__ import annotations

from processors.apply_url import rewrite_apply_url, slugify_role
from processors.normalize import normalize_job


def test_slugify_role() -> None:
    assert slugify_role("Software Engineer") == "software-engineer"
    assert slugify_role("Sr. Product Manager, Community") == "sr-product-manager-community"


def test_rewrite_stripe_jobs_search_gh_jid() -> None:
    url = "https://stripe.com/jobs/search?gh_jid=8107379"
    assert (
        rewrite_apply_url(url, role="Software Engineer")
        == "https://stripe.com/jobs/listing/software-engineer/8107379"
    )


def test_rewrite_stripe_careers_search_gh_jid() -> None:
    url = "https://stripe.com/careers/search?gh_jid=8107379&utm_source=Simplify"
    assert (
        rewrite_apply_url(url, role="Software Engineer", external_id="8107379")
        == "https://stripe.com/jobs/listing/software-engineer/8107379"
    )


def test_rewrite_leaves_other_urls_alone() -> None:
    url = "https://job-boards.greenhouse.io/twitch/jobs/8687988002"
    assert rewrite_apply_url(url, role="PM") == url
    assert rewrite_apply_url(
        "https://stripe.com/jobs/listing/software-engineer/8107379",
        role="Software Engineer",
    ) == "https://stripe.com/jobs/listing/software-engineer/8107379"


def test_normalize_rewrites_stripe_search_url() -> None:
    job = normalize_job(
        {
            "company": "Stripe",
            "role": "Software Engineer",
            "location": "South San Francisco, CA",
            "apply_url": "https://stripe.com/jobs/search?gh_jid=8107379",
            "age": "1d",
            "source": "greenhouse",
            "external_id": "8107379",
        }
    )
    assert job.apply_url == (
        "https://stripe.com/jobs/listing/software-engineer/8107379"
    )
