# Playwright Automation Backend

Fallback automation engine for **AI Job Hunter**. The Chrome extension remains the primary UI and autofill path; this service is only called when content scripts cannot complete an action (custom React dropdowns, shadow DOM, stubborn file uploads, multi-step wizards, etc.).

```text
Chrome Extension  →  Local Node API (:8090)  →  Playwright  →  Existing Chrome (CDP)
```

## Requirements

- Node.js 20+
- Google Chrome (or Chromium) with remote debugging enabled
- The AI Job Hunter extension talking to `http://localhost:8090`

## Enable Chrome CDP

Quit Chrome completely, then start it with a debugging port (keep a dedicated user-data-dir so your normal profile stays clean, **or** point at your real profile if you need existing ATS logins):

```bash
# macOS — dedicated profile (recommended for development)
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="/tmp/chrome-aijh-debug"
```

```bash
# Linux
google-chrome --remote-debugging-port=9222 --user-data-dir="/tmp/chrome-aijh-debug"
```

Verify CDP:

```bash
curl -s http://127.0.0.1:9222/json/version
```

If Chrome is not reachable, `POST /automation/*` returns `503` with `code: "CDP_UNAVAILABLE"` and setup instructions for the extension to show the user.

## Install & run

```bash
cd automation-backend
cp .env.example .env
npm install
npm run dev          # http://127.0.0.1:8090
```

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Process up |
| GET | `/automation/health` | Process + CDP + sessions |
| POST | `/automation/start` | Attach to Chrome tab / open URL |
| POST | `/automation/fill` | Fill fields / profile |
| POST | `/automation/upload` | Resume upload |
| POST | `/automation/click` | Click a target |
| POST | `/automation/continue` | Click Next / Continue |
| POST | `/automation/click_next` | Alias of continue |
| POST | `/automation/submit` | Submit application |
| POST | `/automation/stop` | Drop session (does not quit Chrome) |
| POST | `/automation/fallback` | One-shot start+fill(+upload) for the extension |
| POST | `/automation/detect` | ATS detection only |
| POST | `/automation/extract_questions` | List visible questions |

### Example body

```json
{
  "url": "https://boards.greenhouse.io/acme/jobs/123",
  "tabUrl": "https://boards.greenhouse.io/acme/jobs/123",
  "profile": { "firstName": "Ada", "lastName": "Lovelace", "email": "ada@example.com" },
  "fields": [
    { "label": "First Name", "canonicalKey": "first_name", "value": "Ada", "selector": "#first_name" }
  ],
  "resumeBase64": "<optional>",
  "resumeFilename": "resume.pdf",
  "sessionId": "<optional opaque id>"
}
```

### Response shape

```json
{
  "success": true,
  "logs": [{ "ts": "...", "level": "info", "message": "Filled First Name" }],
  "pageState": { "url": "...", "title": "...", "ats": "greenhouse" },
  "nextAction": "continue",
  "sessionId": "...",
  "data": {}
}
```

On failure: `error`, `code`, optional `artifacts.screenshot` / `artifacts.html`, and stack in `data.stack`.

## Session model

- One CDP connection is reused across requests (`browserManager`).
- Sessions reuse the matching Chrome tab when possible (never force a fresh login if cookies already exist).
- `stop` only forgets the Playwright session handle — it does **not** close the user's browser.

## Captcha policy

CAPTCHAs are detected and automation **pauses**. The API returns `409` / `CAPTCHA_DETECTED` and `nextAction: "wait_user"`. The user solves it in Chrome; the extension calls `/automation/continue` afterward. We never attempt to solve captchas.

## Extending ATS support

Add `src/automation/adapters/myAtsAdapter.ts` implementing `AtsAdapter`, then register it in `adapters/index.ts`. Core browser/session code stays untouched.

## Architecture notes

See comments in `src/automation/playwright.ts` and the root project README. This service is intentionally separate from the Python FastAPI `Backend/` so Playwright stays in Node and the extension can fail open when automation is offline.
