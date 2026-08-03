import base64
import os

import requests
from dotenv import load_dotenv
from rich import print

load_dotenv()

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")

REPO_OWNER = "pittcsc"
REPO_NAME = "Summer2026-Internships"


def fetch_readme():

    url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/readme"

    # headers = {
    #     "Authorization": f"Bearer {GITHUB_TOKEN}",
    #     "Accept": "application/vnd.github+json",
    # }

    response = requests.get(url)

    response.raise_for_status()

    data = response.json()

    content = base64.b64decode(data["content"]).decode("utf-8")

    return content
