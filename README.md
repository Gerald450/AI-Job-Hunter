# AI Job Hunter

I'm an aspiring AI / software engineer trying to land a new-grad role without spending half my life refreshing job boards. Sponsorship-friendly openings show up across a million ATS portals, disappear in days, and half of them quietly say "no sponsorship" somewhere in paragraph six. So I built this — a pipeline that finds jobs for me, filters the ones that might actually hire internationals, and helps me apply faster.

A lot of this was built with **[Cursor](https://cursor.com) as an agent** — pairing with an AI coding agent to ship scrapers, a sponsorship detector, a dashboard, and a Chrome autofill extension without getting stuck reinventing every ATS form from scratch.

---

## The problem (aka my life)

- New-grad SWE roles are scattered across Greenhouse, Lever, Ashby, Workday, random GitHub lists, etc.
- Manually checking "do they sponsor?" burns hours every week
- Application forms are the same questions in slightly different shapes, over and over
- I wanted an easy path: **see good jobs → apply with less friction**

## What this does

1. **Ingest** — Pull listings from community sources (PittCSC, SimplifyJobs) and normalize them into one schema
2. **Enrich** — Hit ATS pages (Greenhouse, Lever, Ashby, Workday, SmartRecruiters, …) for full descriptions
3. **Filter** — Pattern-match sponsorship language so I can focus on roles that don't immediately rule me out
4. **Browse** — A Next.js dashboard of US new-grad / entry-level jobs that look sponsorship-friendly
5. **Match on demand** — Upload a resume once, then analyze selected jobs (or first N) with Groq; results are cached until the resume or description changes
6. **Apply faster** — A Chrome extension that detects form fields on ATS pages and autofills from my profile

```text
Job lists (PittCSC, Simplify, …)
        │
        ▼
   Backend pipeline  →  PostgreSQL
        │                    │
        │                    ├── FastAPI  →  Frontend dashboard
        │                    │
        └── ATS fetchers + sponsorship detector
                             │
                    Chrome extension (autofill)
```

## Repo layout

| Folder | What it is |
|--------|------------|
| [`Backend/`](Backend/) | Python aggregation, ATS fetchers, sponsorship detection, FastAPI + Postgres |
| [`frontend/`](frontend/) | Next.js UI for browsing filtered jobs |
| [`chrome-extension/`](chrome-extension/) | Manifest V3 extension — semantic field detection + autofill across ATS sites |

## Stack

- **Backend:** Python, FastAPI, SQLAlchemy, PostgreSQL, httpx, BeautifulSoup
- **Frontend:** Next.js, React, TanStack Query, Tailwind
- **Extension:** TypeScript, Vite, React, Chrome MV3
- **Built with:** Cursor (agent-assisted development)

## Quick start

### Backend

```bash
cd Backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# configure DATABASE_URL / .env as needed
cd app
python main.py              # aggregate from GitHub lists + Greenhouse/Ashby/Lever boards
python main.py --enrich     # fetch descriptions, store them, run sponsorship detection
uvicorn api:app --reload --app-dir .   # API on :8000
```

Board tokens and provider toggles live in `Backend/app/config/` (`companies.yaml`, `providers.yaml`, `role_families.yaml`, `early_career.yaml`).

Set `GROQ_API_KEY` in `Backend/.env` (optional `GROQ_MODEL`, default `llama-3.3-70b-versatile`) for on-demand resume matching.

Upload a resume for matching (parses once with Groq; returns `resumeId`):

```bash
curl -s -F "file=@/path/to/your_resume.pdf" http://localhost:8000/api/resumes
```

Analyze a single job (on demand — never auto-runs over the whole DB):

```bash
curl -s -X POST http://localhost:8000/api/jobs/<job_uuid>/analyze \
  -H 'Content-Type: application/json' \
  -d '{"resumeId":"resume_…"}'
```

Upload a resume for the Chrome extension only (binary store, no LLM parse):

```bash
curl -s -F "file=@/path/to/your_resume.pdf" http://localhost:8000/extension/resumes
```

### Frontend

```bash
cd frontend
npm install
npm run dev                 # http://localhost:3000
```

### Chrome extension

```bash
cd chrome-extension
pnpm install && pnpm build
# Load unpacked → chrome-extension/dist  (not the source root)
```

See [`chrome-extension/README.md`](chrome-extension/README.md) for loading details and ATS adapter notes.

## Why I built it this way

I'm not trying to replace LinkedIn Easy Apply with a black-box auto-submitter on day one. I want **control**: see what got scraped, know why a role was flagged for sponsorship, then use the extension to skip the boring form typing. Clean data first, smarter automation later (ranking, resume tweaks, notifications) once the boring parts are reliable.

If you're also a new-grad hunting in a noisy market — same energy. Steal ideas, fork it, break it, make applying suck less.

## License

MIT
