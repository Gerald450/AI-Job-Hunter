from clients.db import create_database
from clients.pittcsc import fetch_readme
from processors.normalize import normalize_job
from processors.pittParser import parse_jobs
from rich import print

content = fetch_readme()

jobs = parse_jobs(content)

normalized = []
for job in jobs:
    normalized.append(normalize_job(job))

# print(len(normalized))
print("Creating Database....")
create_database()
print("Done...")
