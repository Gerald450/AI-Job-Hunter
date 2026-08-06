# AI Job Hunter — Chrome Extension

Manifest V3 Chrome extension that autofills job applications using a **generic semantic field detection engine**. Works on Greenhouse, Lever, Ashby, Workable, Workday, SmartRecruiters, iCIMS, Oracle, Taleo, SuccessFactors, and completely unknown / custom career portals.

ATS adapters are optional accuracy boosts — they never replace the generic engine.

## Architecture

```text
Page Loaded
      ↓
Detect ATS (if known)
      ↓
If adapter exists:
    Extract additional ATS-specific metadata
      ↓
Run Generic Field Detection Engine   ← primary source of truth
      ↓
Normalize all fields into a common schema
      ↓
Send normalized fields to backend
      ↓
Receive autofill values (+ restore multi-page session)
      ↓
Autofill page
      ↓
Highlight uncertain fields
```

## Features

- **Generic semantic detector** — inputs, textareas, selects, checkboxes, radios, file uploads, ARIA comboboxes, contenteditable, searchable dropdowns
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
- AI Job Hunter backend running (default `http://localhost:8000`)

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

## Adding a new ATS adapter

1. Create `src/content/ats/<name>.ts` implementing `AtsAdapter`
2. Register it in `src/content/ats/index.ts`
3. Optionally add host matches in `manifest.json`

Do **not** modify the detector or autofill engine. Adapters may only:

- `matches()` — detect the ATS
- `enrichFields?()` — improve labels / metadata
- `extractJob?()` — job posting details
- `detectStepChange?()` — multi-page wizards

## Extending semantic aliases

Edit `src/lib/semantics.ts` → `CANONICAL_ALIASES`, or call `registerAlias()` at runtime.

## Backend endpoints expected

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Connectivity check |
| POST | `/extension/profile` | User profile |
| POST | `/extension/autofill` | Field → value map with confidence |
| POST | `/extension/job` | Qualification scoring |
| POST | `/extension/questions` | Screening answers |
| POST | `/extension/resumes` | **Upload** resume (multipart `file`) → `{ resumeId, filename, … }` |
| POST | `/extension/upload` | **Download** resume blob by `{ resumeId }` (used by autofill) |

Until profile/autofill/job/questions exist, the extension falls back to the cached profile + session store. Resume upload/serve is implemented on the backend.

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
  "size": 184320
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
