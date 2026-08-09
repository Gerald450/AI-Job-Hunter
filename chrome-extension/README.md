# AI Job Hunter — Chrome Extension

Manifest V3 Chrome extension that autofills job applications using a **generic semantic field detection engine**, scrapes full job descriptions from ATS pages, and runs **resume analysis** through the backend (Groq — API key never leaves the server).

Works on Greenhouse, Lever, Ashby, Workable, Workday, SmartRecruiters, iCIMS, Oracle, Taleo, SuccessFactors, Jobvite, Teamtailor, BambooHR, Recruitee, and completely unknown / custom career portals.

ATS adapters are optional accuracy boosts — they never replace the generic engine.

## Architecture

```text
Page Loaded
      ↓
Detect ATS (if known)
      ↓
If adapter exists:
    Extract job posting (title, company, location, full description)
    Enrich form field metadata
      ↓
Run Generic Field Detection Engine   ← primary source of truth for forms
      ↓
Floating action bar (Analyze Resume · Auto Fill · …)
      ↓
Analyze Resume → scrape JD → POST /extension/job → in-page results panel
Autofill → rule-based fill → (gaps) Playwright CDP fallback → summary → optional AI
```

**Decision tree:** content-script autofill always runs first. Playwright (`automation-backend` on `:8090`) is only invoked when fields remain unresolved, uploads fail, or the user clicks “Retry with Browser Automation”. AI remains opt-in.

## Features

- **Generic semantic detector** — inputs, textareas, selects, checkboxes, radios, file uploads, ARIA comboboxes, contenteditable, searchable dropdowns
- **Two-stage autofill** — fast rule-based fill first; opt-in Groq AI for unresolved fields only
- **Playwright fallback** — local CDP automation for custom dropdowns / uploads / multi-step flows the content script cannot finish (never primary)
- **Learned mappings** — successful AI label→profile maps stored locally (no personal values) to skip future LLM calls
- **Job description fallback** — scrapes the rendered posting so resume analysis works when ATS APIs omit or truncate the JD
- **Resume Match panel** — score, summary, strengths, missing skills, recommendations (Shadow DOM)
- **Session scrape cache** — avoids re-querying the DOM until the URL changes
- Rich field metadata: labels, ARIA, nearby text, parent section, validation messages, options
- Configurable canonical aliases (`first_name`, `phone`, `education`, `resume`, …)
- Pluggable ATS adapters (enrich-only — no duplicate autofill logic)
- Workday multi-page session value preservation + step-change detection
- MutationObserver for dynamically rendered forms
- On-demand content-script injection for unknown sites
- Popup + Options UI (React, Tailwind, React Query)

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/) 9+
- Chrome / Chromium
- AI Job Hunter backend running (default `http://localhost:8000`) with `GROQ_API_KEY` for analysis
- Optional: Playwright automation backend (`http://localhost:8090`) + Chrome started with `--remote-debugging-port=9222` for hard-field fallback

## Install

```bash
cd chrome-extension
pnpm install
pnpm build
```

## Load in Chrome (important)

Chrome cannot load TypeScript source. Always load the **built** folder:

1. `pnpm build`
2. Open `chrome://extensions` → enable **Developer mode**
3. Remove any previous AI Job Hunter install
4. **Load unpacked** → select **`chrome-extension/dist`**

There is no `manifest.json` in the source root on purpose — if Chrome asks for a manifest, you picked the wrong folder.

After loading `dist`, the background service worker should show as active (not “registration failed”).

## Resume analysis (extension)

1. Upload a resume (parses once with Groq — same ID works for autofill + matching):

```bash
curl -s -F "file=@/path/to/resume.pdf" \
  http://localhost:8000/extension/resumes
```

2. In **Options → Resume**, paste `resumeId` and filename; enable **Auto Upload Resume** if desired.
3. Open a supported ATS job page → click the **AJH** floating button → **Analyze Resume** (or use the popup).
4. The extension scrapes the page, `POST`s to `/extension/job`, and shows Resume Match in an in-page panel.

The backend prefers the scraped description when it is richer than the stored one, upserts the job by apply URL, and reuses cached analyses until the resume or description changes. Pass `refresh: true` (panel “Refresh analysis”) to force a new Groq call.

## Adding a new ATS adapter

1. Create `src/content/ats/<name>.ts` implementing `AtsAdapter`
2. Register it in `src/content/ats/index.ts`
3. Add the provider to `AtsProviderSchema` in `src/types/index.ts`
4. Optionally add host matches in `manifest.config.ts`

Do **not** modify the detector or autofill engine. Adapters may only:

- `matches()` — detect the ATS (≈ `canHandle`)
- `enrichFields?()` — improve labels / metadata
- `extractJob?()` — job posting details (≈ `extract` → `JobExtraction`)
- `detectStepChange?()` — multi-page wizards

Verify host patterns:

```bash
node --experimental-strip-types scripts/check-ats-hosts.mts
```

## Extending semantic aliases

Edit `src/lib/semantics.ts` → `CANONICAL_ALIASES`, or call `registerAlias()` at runtime.

## Autofill pipeline (two-stage)

1. **Rule-based** — semantic aliases, learned local mappings, profile, optional `/extension/autofill`, session restore
2. If unresolved fields remain → **summary panel** (`✓ N completed` / `⚠ M need attention`)
3. User clicks **Use AI to Complete Remaining Fields** → `POST /extension/autofill/ai` (one batch request)
4. Confidence bands: ≥0.90 auto-fill · 0.70–0.90 fill + verify highlight · &lt;0.70 confirm in panel
5. Successful maps saved locally by ATS + label/name/id → profile field (values never stored)

AI is never called when every fillable field was completed by stage 1.

## Backend endpoints expected

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Connectivity check |
| POST | `/extension/profile` | User profile from parsed resume (education/degree; contact from cache) |
| POST | `/extension/autofill` | Optional non-AI field map (future; local fallback today) |
| POST | `/extension/autofill/ai` | **Groq AI fallback** for unresolved fields only |
| POST | `/extension/job` | **Resume match** from scraped job page + `resumeId` |
| POST | `/extension/questions` | Screening answers (optional) |
| POST | `/extension/resumes` | Upload + **LLM parse** resume → `{ resumeId, filename, … }` |
| POST | `/extension/upload` | Download resume blob by `{ resumeId }` (autofill) |

### Upload a resume (then paste into Options)

With the API running on `:8000`:

```bash
curl -s -F "file=@/path/to/Gerald_Shimo_Resume.pdf" \
  http://localhost:8000/extension/resumes
```

Example response:

```json
{
  "resumeId": "resume_a1b2c3d4e5f6",
  "filename": "Gerald_Shimo_Resume.pdf",
  "contentType": "application/pdf",
  "size": 184320,
  "parsed": { "skills": ["…"], "…": "…" }
}
```

In the extension **Options → Resume**, paste:

- **Resume ID** → `resumeId`
- **Resume Filename** → `filename`

Enable **Auto Upload Resume**. On application pages with a file input, the extension will `POST /extension/upload` with that ID and attach the file.

## Permissions

- `storage` — settings, JWT, cached profile, multi-page session values
- `activeTab` / `tabs` / `scripting` — messaging and on-demand injection for unknown sites
- Host permissions for known ATS hosts, Workday, and `http(s)://*/*` for generic portals
