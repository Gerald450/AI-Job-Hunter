from clients.db import SessionLocal, create_database
from clients.pittcsc import fetch_readme
from database.crud import insert_jobs
from processors.normalize import normalize_job
from processors.pittParser import parse_jobs
from rich import print

content = fetch_readme()

jobs = parse_jobs(content)

normalized = []
for job in jobs:
    normalized.append(normalize_job(job))


print(len(normalized))

# create tables if they dont exist
print("Creating Database....")
create_database()
print("Done...")


# start a session
db = SessionLocal()

print("Inserting data......")
try:
    insert_jobs(db, normalized)
finally:
    db.close()
