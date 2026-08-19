# AI Job Hunter

An AI-powered job hunting pipeline for new graduate software engineers — continuously collecting openings, normalizing them into structured data, and (eventually) ranking and applying to roles that match your preferences.

> **The problem:** Sponsorship-friendly new grad roles are scattered across dozens of sources, expire quickly, and burn hours of manual checking every day.  
> **The approach:** Automate ingestion, filtering, ranking, and application — so the search scales with the market, not with your free time.

![Python](https://img.shields.io/badge/Python-3.9+-3776AB?style=flat&logo=python&logoColor=white)
![Status](https://img.shields.io/badge/Status-Active%20Development-yellow)
![Phase](https://img.shields.io/badge/Phase-1%20Data%20Collection-0A66C2)
![License](https://img.shields.io/badge/License-MIT-green)

---

## Features

**Built**
- ✅ Job source ingestion (PittCSC internship list via GitHub API)
- ✅ HTML table parsing with BeautifulSoup + lxml
- ✅ Structured extraction (`company`, `role`, `location`, `apply_url`, `age`)
- ✅ Modular scraper / parser separation

**In progress / planned**
- 🚧 Multi-source scraping (additional boards & repos)
- 🚧 Cross-source normalization & duplicate removal
- ✅ Intelligent filtering & sponsor detection
- ✅ On-demand resume matching (Groq) with cache + batch SSE
- 🚧 Auto-apply with customized resumes / cover letters
- 🚧 Dashboard, notifications & analytics

---

## System Architecture

Phase 1 implements the top of the pipeline. Downstream stages are designed in but not yet built.

```text
┌─────────────────┐
│   Job Sources   │  GitHub lists, boards, ATS feeds (expanding)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    Scrapers     │  Source-specific clients (HTTP / API)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   HTML Parser   │  Per-source parsers → shared schema
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Normalizer    │  Canonical fields, dedup  [planned]
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Job Objects   │  Structured, source-agnostic records
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    Database     │  Persistence & query layer  [planned]
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ AI Ranking Eng. │  Embeddings + preference scoring  [planned]
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Resume Matcher  │  Fit scoring against your profile  [planned]
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Application Eng.│  Customize & submit applications  [planned]
└─────────────────┘
```

---

## Tech Stack

| Layer | Current | Planned |
|-------|---------|---------|
| Language | Python | — |
| Ingestion | Requests | Playwright (JS-heavy pages) |
| Parsing | BeautifulSoup, lxml | Additional source parsers |
| API | — | FastAPI |
| Storage | — | PostgreSQL, Redis |
| AI / ML | — | OpenAI / Gemini embeddings, Sentence Transformers |
| Workers | — | Celery |
| Infra | — | Docker, GitHub Actions |

---

## Folder Structure

```text
AI-Job-Hunter/
├── Backend/
│   └── app/
│       ├── main.py                 # Entry point — fetch → parse → output
│       ├── clients/
│       │   └── pittcsc.py          # Source client (GitHub API README fetch)
│       └── processors/
│           └── pittParser.py       # Source parser → structured job dicts
├── .env                            # Secrets (not committed)
├── .gitignore
└── README.md
```

Each new job source is intended to follow the same pattern: a **client** that fetches raw content, and a **processor** that maps it into a shared job schema.

---

## Example Workflow

What happens today when you run the program:

1. **Fetch** — `clients/pittcsc.py` calls the GitHub API for the PittCSC internship README and base64-decodes the markdown/HTML content.
2. **Parse** — `processors/pittParser.py` loads the content with BeautifulSoup (`lxml`), walks job tables, and skips malformed rows.
3. **Extract** — Each valid row becomes a structured object:

   ```python
   {
       "company": "Example Corp",
       "role": "Software Engineering Intern",
       "location": "San Francisco, CA",
       "apply_url": "https://...",
       "age": "2d",
   }
   ```

4. **Output** — `main.py` prints the list of jobs (persistence and ranking come in later phases).

```bash
cd Backend/app
python main.py
```

Conference discovery (does not run the job pipeline):

```bash
python conferences.py
python conferences.py --verify --verify-limit 50
```

API: `GET /api/conferences`, `/api/conferences/recommended`, `/api/conferences/deadlines`, `/api/conferences/funding`, `/api/conferences/eligibility`, `/api/conferences/{id}`.


---

## Design Decisions

**BeautifulSoup + lxml**  
Internship lists are often published as HTML tables. BeautifulSoup keeps parsers readable and resilient to messy markup; `lxml` is a fast, reliable backend for that workload. When a source needs a browser (heavy JS), Playwright can sit behind the same client interface.

**Separate scrapers and parsers**  
Fetching and interpreting are different failure modes. Isolating them means a broken layout does not force a rewrite of the HTTP client, and a new source does not require reinventing auth or rate-limit handling.

**Modular, per-source parsers**  
Every board formats roles differently. Source-specific processors keep edge cases local while still emitting a shared schema — easier to extend than one mega-parser with `if source == ...` branches.

**Structured job objects early**  
Even before a database exists, normalizing to dicts with stable keys forces a clear contract between ingestion and everything that will consume it (filters, rankers, apply engine).

**Database as a deliberate next step**  
In-memory lists are fine for validating parsers. Persistence (PostgreSQL) becomes necessary once you need dedup across runs, ranking history, and API access — not before the schema is stable.

**AI ranking as a pipeline stage, not a monolith**  
Ranking should sit on top of clean, deduplicated jobs. Building ingestion first avoids training or prompting against noisy, half-parsed data.

---

## Future Roadmap

### Phase 1 — Data Collection *(current)*
- Multi-source scrapers
- HTML / markdown parsing
- Structured extraction
- Normalization & duplicate removal

### Phase 2 — Intelligence
- Preference-based filtering
- Sponsorship signal detection
- Resume ↔ job matching
- Embedding-based ranking (OpenAI / Gemini / Sentence Transformers)

### Phase 3 — Automation
- Resume customization per role
- Cover letter generation
- Controlled auto-apply flows
- Retry / failure handling for submissions

### Phase 4 — Dashboard
- Web UI for shortlisted roles
- Notifications (email / Discord / Slack)
- Application tracking & simple analytics

### Phase 5 — Distributed scraping
- Async / concurrent fetchers
- Celery workers & Redis queues
- Rate limiting, proxies, and monitoring
- Dockerized deployment & CI/CD

---

## Engineering Principles

- **Separation of concerns** — clients fetch; processors parse; later stages rank and act
- **Modular architecture** — new sources plug in without rewriting the core loop
- **Extensible parser interfaces** — one schema in, many sources out
- **Clean data models** — structured jobs before fancy ML
- **Incremental development** — ship a working ingestion path before automation
- **Automation first** — design for unattended runs, not one-off scripts

---

## What I Learned

Building even the first slice of this system made a few things concrete:

**Scraping is product surface, not a script.** Sources change layout, rate-limit, and encode content differently (e.g. GitHub’s base64 README payload). Treating each source as a small, testable module is what keeps the project maintainable as coverage grows.

**Normalization is the hard part.** Tables look similar until you hit missing columns, nested links, or “age” fields that are human-readable strings. Defining a shared job object early surfaces these inconsistencies immediately instead of burying them in the UI later.

**Maintainability beats clever one-liners.** A 40-line parser that maps rows to a schema is easier to debug at 2 a.m. than a dense regex pipeline. Clarity matters more when the next feature depends on trusting your data.

**Plan for scale without building it yet.** Async workers, Redis, and vector search are on the roadmap — but they only pay off once ingestion is reliable. Shipping Phase 1 first is an intentional tradeoff: validate the data contract, then invest in infrastructure.

**Tradeoffs are explicit.** BeautifulSoup is the right default for static HTML; Playwright is reserved for pages that need a real browser. That keeps the dependency footprint small until complexity is justified.

---

## Future Improvements

- Asynchronous / concurrent scraping
- Rotating proxies and polite rate limiting
- Retries with backoff for flaky sources
- Distributed workers (Celery + Redis)
- Embedding search over job descriptions
- LLM-powered ranking and explanation
- Vector database for similarity retrieval
- Observability (logging, metrics, alerts)
- CI/CD via GitHub Actions
- Dockerized local and production deploys

---

## About the Author

Computer Science & Mathematics student graduating in **2027**, exploring New Grad Software Engineering roles in:

- Backend Engineering  
- AI Infrastructure  
- Distributed Systems  
- Machine Learning Systems  

This project is a deliberate exercise in building production-shaped systems incrementally — clean interfaces, honest scope, and a path from data collection to intelligent automation.

---

## License

MIT
