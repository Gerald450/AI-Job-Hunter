import hashlib


def create_fingerprint(job):

    raw = f"{job['company']}|{job['role']}|{job['location']}|{job['apply_url']}"

    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
