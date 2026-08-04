from model.job import Job
from utils.fingerprint import create_fingerprint

# Emoji markers used by the Pitt CSC repo.

FAANG = "🔥"
NO_SPONSOR = "🛂"
US_CITIZEN = "🇺🇸"
CLOSED = "🔒"
ADVANCED = "🎓"


def normalize_job(job):
    normalized = job.copy()

    company = normalized["company"]
    role = normalized["role"]

    normalized["faang"] = FAANG in company
    normalized["no_sponsorship"] = NO_SPONSOR in role
    normalized["citizenship_required"] = US_CITIZEN in role
    normalized["closed"] = CLOSED in role
    normalized["advanced_degree"] = ADVANCED in role

    for marker in [FAANG, NO_SPONSOR, US_CITIZEN, CLOSED, ADVANCED]:
        company = company.replace(marker, "")
        role = role.replace(marker, "")

    normalized["company"] = company.strip()
    normalized["role"] = role.strip()
    normalized["fingerprint"] = create_fingerprint(normalized)

    return Job(
        company=normalized["company"],
        role=normalized["role"],
        location=normalized["location"],
        apply_url=normalized["apply_url"],
        age=normalized["age"],
        fingerprint=normalized["fingerprint"],
        source=normalized.get("source", "pittcsc"),
        faang=normalized["faang"],
        no_sponsorship=normalized["no_sponsorship"],
        citizenship_required=normalized["citizenship_required"],
        closed=normalized["closed"],
        advanced_degree=normalized["advanced_degree"],
    )
