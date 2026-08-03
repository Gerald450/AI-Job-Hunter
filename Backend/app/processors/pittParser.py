from bs4 import BeautifulSoup
from rich import print


def parse_jobs(html):

    soup = BeautifulSoup(html, "lxml")

    jobs = []

    tables = soup.find_all("table")

    for table in tables:
        rows = table.find_all("tr")

        for row in rows[1:]:
            columns = row.find_all("td")

            if len(columns) < 5:
                continue

            company = columns[0].get_text(strip=True)
            role = columns[1].get_text(strip=True)
            location = columns[2].get_text(strip=True)
            application = columns[3]

            link = None

            anchor = application.find("a")
            if anchor:
                link = anchor.get("href")

            age = columns[4].get_text(strip=True)

            jobs.append(
                {
                    "company": company,
                    "role": role,
                    "location": location,
                    "apply_url": link,
                    "age": age,
                    "source": "pittscs",
                }
            )

    return jobs
