"""GitHub client for the SimplifyJobs New-Grad-Positions README."""

from __future__ import annotations

import base64
import logging

import requests

logger = logging.getLogger(__name__)


REPO_OWNER = "SimplifyJobs"
REPO_NAME = "New-Grad-Positions"
# The public list is maintained on the ``dev`` branch.
REPO_REF = "dev"


def fetch_readme(*, ref: str = REPO_REF) -> str:
    """Download and decode the SimplifyJobs New-Grad-Positions README."""
    url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/readme"

    params = {"ref": ref}
    logger.info(
        "Fetching SimplifyJobs README: %s/%s ref=%s",
        REPO_OWNER,
        REPO_NAME,
        ref,
    )
    response = requests.get(url, params=params, timeout=30)

    response.raise_for_status()

    data = response.json()
    content = base64.b64decode(data["content"]).decode("utf-8")
    logger.info("SimplifyJobs README downloaded (%s chars)", len(content))
    return content
