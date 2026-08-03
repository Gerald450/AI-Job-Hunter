from clients.pittcsc import fetch_readme
from processors.pittParser import parse_jobs
from rich import print

content = fetch_readme()

jobs = parse_jobs(content)

print(jobs)
