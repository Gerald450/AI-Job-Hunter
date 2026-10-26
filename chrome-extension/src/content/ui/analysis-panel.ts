/**
 * In-page analysis results panel (Shadow DOM).
 */

import type { JobAnalysisResponse, JobListingChoice } from "@/types";
import { logger } from "@/lib/logger";

const SCOPE = "ui/analysis-panel";
const HOST_ID = "aijh-analysis-panel-host";

type PanelState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "result"; analysis: JobAnalysisResponse };

export interface AnalysisPanelHandlers {
  onRetry?: () => void;
  onRefresh?: () => void;
  onSaveDescription?: () => void | Promise<void>;
  onListJob?: (choice: JobListingChoice) => void | Promise<void>;
}

let hostEl: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let onRetry: (() => void) | null = null;
let onRefresh: (() => void) | null = null;
let onSaveDescription: (() => void | Promise<void>) | null = null;
let onListJob: ((choice: JobListingChoice) => void | Promise<void>) | null = null;
let saveBusy = false;
let saveDone = false;
let saveDismissed = false;
let listingBusy = false;
let listingChoice: JobListingChoice | null = null;

const STYLES = `
:host {
  all: initial;
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
}
.panel {
  position: fixed;
  right: 20px;
  bottom: 84px;
  z-index: 2147483646;
  width: min(360px, calc(100vw - 32px));
  max-height: min(70vh, 560px);
  overflow: auto;
  background: #fff;
  color: #0f172a;
  border-radius: 14px;
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.28);
  border: 1px solid #e2e8f0;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 14px 16px 10px;
  border-bottom: 1px solid #f1f5f9;
  position: sticky;
  top: 0;
  background: #fff;
}
.title {
  font-size: 14px;
  font-weight: 700;
  margin: 0;
}
.close {
  appearance: none;
  border: 0;
  background: transparent;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  color: #64748b;
  padding: 4px 6px;
}
.body { padding: 14px 16px 18px; }
.score {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  margin: 0 0 10px;
  min-height: 40px;
  line-height: 1;
}
.score-num {
  display: block;
  font-size: 36px;
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1;
  color: #0d9488;
}
.score-den {
  font-size: 14px;
  color: #64748b;
  font-weight: 600;
  line-height: 1.2;
  padding-bottom: 4px;
}
.job-line {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  line-height: 1.4;
  margin: 0 0 8px;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #64748b;
  line-height: 1.4;
  margin: 0 0 12px;
}
.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  background: #f0fdfa;
  color: #0f766e;
  font-weight: 600;
  font-size: 11px;
  line-height: 1.4;
}
.source-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 1.4;
  color: #64748b;
}
.source-k {
  font-weight: 600;
  color: #475569;
}
.source-chip {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 6px;
  background: #f1f5f9;
  color: #334155;
  font-weight: 600;
  font-size: 11px;
  line-height: 1.4;
}
.source-chip-external {
  background: #f0f9ff;
  color: #075985;
}
.section { margin-top: 14px; }
.section h3 {
  margin: 0 0 6px;
  font-size: 12px;
  line-height: 1.3;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}
.section p, .section li {
  font-size: 13px;
  line-height: 1.45;
  color: #334155;
  margin: 0;
}
.section ul {
  margin: 0;
  padding-left: 18px;
}
.loading {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: #475569;
  padding: 8px 0;
}
.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #cbd5e1;
  border-top-color: #0d9488;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.error {
  font-size: 13px;
  color: #b91c1c;
  line-height: 1.4;
}
.save-prompt {
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f0fdfa;
  border: 1px solid #99f6e4;
  font-size: 13px;
  color: #134e4a;
  line-height: 1.4;
}
.save-prompt p { margin: 0 0 8px; }
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}
.actions button {
  appearance: none;
  border: 0;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  background: #0d9488;
  color: #fff;
}
.actions button.secondary {
  background: #f1f5f9;
  color: #334155;
}
.actions button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.listing-actions {
  flex-direction: column;
}
.listing-actions button {
  width: 100%;
}
`;

function ensureHost(): ShadowRoot {
  if (shadow) return shadow;
  hostEl = document.getElementById(HOST_ID) as HTMLElement | null;
  if (!hostEl) {
    hostEl = document.createElement("div");
    hostEl.id = HOST_ID;
    document.documentElement.appendChild(hostEl);
  }
  shadow = hostEl.shadowRoot ?? hostEl.attachShadow({ mode: "open" });
  return shadow;
}

function listSection(title: string, items: string[] | undefined): string {
  if (!items?.length) return "";
  const lis = items.map((i) => `<li>${escapeHtml(i)}</li>`).join("");
  return `<div class="section"><h3>${escapeHtml(title)}</h3><ul>${lis}</ul></div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function applyHandlers(handlers?: AnalysisPanelHandlers): void {
  if (handlers?.onRetry) onRetry = handlers.onRetry;
  if (handlers?.onRefresh) onRefresh = handlers.onRefresh;
  if (handlers?.onSaveDescription !== undefined) {
    onSaveDescription = handlers.onSaveDescription;
  }
  if (handlers?.onListJob !== undefined) {
    onListJob = handlers.onListJob;
  }
}

function render(state: PanelState): void {
  const root = ensureHost();
  root.innerHTML = "";
  const style = document.createElement("style");
  style.textContent = STYLES;
  root.appendChild(style);

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Resume analysis");

  const header = document.createElement("div");
  header.className = "header";
  header.innerHTML = `<h2 class="title">Resume Match</h2>`;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "close";
  close.setAttribute("aria-label", "Close");
  close.textContent = "×";
  close.addEventListener("click", hideAnalysisPanel);
  header.appendChild(close);
  panel.appendChild(header);

  const body = document.createElement("div");
  body.className = "body";

  if (state.kind === "loading") {
    body.innerHTML = `<div class="loading"><div class="spinner"></div>Analyzing resume...</div>`;
  } else if (state.kind === "error") {
    body.innerHTML = `<div class="error">${escapeHtml(state.message)}</div>`;
    const actions = document.createElement("div");
    actions.className = "actions";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "Retry";
    retry.addEventListener("click", () => onRetry?.());
    actions.appendChild(retry);
    body.appendChild(actions);
  } else {
    const a = state.analysis;
    const score = a.overall_match ?? a.score ?? 0;
    const jobLine =
      a.company && a.role
        ? `${a.company} · ${a.role}`
        : a.company || a.role || "";
    const pendingListing =
      Boolean(a.askListing) && !listingChoice && Boolean(onListJob);
    const listedAsApplied =
      listingChoice === "applied" || (a.applied && !pendingListing && listingChoice == null);
    const chips = [
      listedAsApplied ? "Saved as applied" : null,
      listingChoice === "not_applied" ? "Listed as not applied" : null,
      !listedAsApplied &&
      listingChoice !== "not_applied" &&
      listingChoice !== "unlisted" &&
      !pendingListing &&
      a.descriptionPersisted
        ? "Description saved"
        : null,
      a.cached ? "Cached" : null,
      a.confidence ? `Confidence: ${a.confidence}` : null,
    ].filter((bit): bit is string => Boolean(bit));

    body.innerHTML = `
      <div class="score">
        <span class="score-num">${score}</span>
        <span class="score-den">/ 100</span>
      </div>
      ${jobLine ? `<div class="job-line">${escapeHtml(jobLine)}</div>` : ""}
      ${
        a.source === "extension"
          ? `<div class="source-line"><span class="source-k">Source:</span>${
              a.atsSource
                ? `<span class="source-chip">${escapeHtml(a.atsSource)}</span>`
                : ""
            }<span class="source-chip source-chip-external">External</span></div>`
          : ""
      }
      ${
        chips.length
          ? `<div class="meta">${chips
              .map((chip) =>
                chip === "Saved as applied" ||
                chip === "Listed as not applied" ||
                chip === "Description saved"
                  ? `<span class="badge">${escapeHtml(chip)}</span>`
                  : `<span>${escapeHtml(chip)}</span>`,
              )
              .join("")}</div>`
          : ""
      }
      ${
        a.summary
          ? `<div class="section"><h3>Summary</h3><p>${escapeHtml(a.summary)}</p></div>`
          : ""
      }
      ${listSection("Strengths", a.strengths)}
      ${listSection("Missing Skills", a.missing_skills ?? a.gaps)}
      ${listSection("Recommendations", a.recommended_improvements)}
      ${listSection("Matched Keywords", a.matched_keywords)}
      ${listSection("Missing Keywords", a.missing_keywords)}
    `;

    const showSave =
      !pendingListing &&
      !listingChoice &&
      Boolean(a.canSaveDescription) &&
      !a.descriptionPersisted &&
      !a.applied &&
      !saveDone &&
      !saveDismissed &&
      Boolean(onSaveDescription);

    if (pendingListing) {
      const prompt = document.createElement("div");
      prompt.className = "save-prompt";
      const label = document.createElement("p");
      label.textContent = "List this job?";
      const hint = document.createElement("p");
      hint.style.color = "#0f766e";
      hint.textContent =
        "Applied, not applied, or leave it off your dashboard.";
      prompt.appendChild(label);
      prompt.appendChild(hint);
      const listActions = document.createElement("div");
      listActions.className = "actions listing-actions";
      listActions.style.marginTop = "0";

      const choices: { choice: JobListingChoice; label: string; secondary?: boolean }[] =
        [
          { choice: "applied", label: "Applied" },
          { choice: "not_applied", label: "Not applied", secondary: true },
          { choice: "unlisted", label: "Don't list", secondary: true },
        ];

      for (const item of choices) {
        const button = document.createElement("button");
        button.type = "button";
        if (item.secondary) button.className = "secondary";
        button.textContent = listingBusy ? "Saving…" : item.label;
        button.disabled = listingBusy;
        button.addEventListener("click", async () => {
          if (!onListJob || listingBusy) return;
          listingBusy = true;
          render(state);
          try {
            await onListJob(item.choice);
            listingChoice = item.choice;
          } catch {
            // The caller surfaces the error. Keep the prompt so they can retry.
          } finally {
            listingBusy = false;
            render(state);
          }
        });
        listActions.appendChild(button);
      }
      prompt.appendChild(listActions);
      body.appendChild(prompt);
    } else if (showSave) {
      const prompt = document.createElement("div");
      prompt.className = "save-prompt";
      const label = document.createElement("p");
      label.textContent = "Save this job description?";
      prompt.appendChild(label);
      const saveActions = document.createElement("div");
      saveActions.className = "actions";
      saveActions.style.marginTop = "0";

      const yes = document.createElement("button");
      yes.type = "button";
      yes.textContent = saveBusy ? "Saving…" : "Yes, save";
      yes.disabled = saveBusy;
      yes.addEventListener("click", async () => {
        if (!onSaveDescription || saveBusy) return;
        saveBusy = true;
        render(state);
        try {
          await onSaveDescription();
          saveDone = true;
        } finally {
          saveBusy = false;
          render(state);
        }
      });

      const no = document.createElement("button");
      no.type = "button";
      no.className = "secondary";
      no.textContent = "Not now";
      no.disabled = saveBusy;
      no.addEventListener("click", () => {
        saveDismissed = true;
        render(state);
      });

      saveActions.appendChild(yes);
      saveActions.appendChild(no);
      prompt.appendChild(saveActions);
      body.appendChild(prompt);
    } else if (listingChoice === "applied" || (a.applied && !listingChoice)) {
      const note = document.createElement("div");
      note.className = "meta";
      note.style.marginTop = "12px";
      note.textContent = "Listed as applied. This role will appear under Applied in the dashboard.";
      body.appendChild(note);
    } else if (listingChoice === "not_applied") {
      const note = document.createElement("div");
      note.className = "meta";
      note.style.marginTop = "12px";
      note.textContent = "Listed as not applied. This role will appear in your job list.";
      body.appendChild(note);
    } else if (listingChoice === "unlisted") {
      const note = document.createElement("div");
      note.className = "meta";
      note.style.marginTop = "12px";
      note.textContent = "This job will not be listed.";
      body.appendChild(note);
    } else if (saveDone || a.descriptionPersisted) {
      const note = document.createElement("div");
      note.className = "meta";
      note.style.marginTop = "12px";
      note.textContent = "Job description saved for future analyses.";
      body.appendChild(note);
    }

    const actions = document.createElement("div");
    actions.className = "actions";
    const refresh = document.createElement("button");
    refresh.type = "button";
    refresh.className = "secondary";
    refresh.textContent = "Refresh analysis";
    refresh.addEventListener("click", () => onRefresh?.());
    actions.appendChild(refresh);
    body.appendChild(actions);
  }

  panel.appendChild(body);
  root.appendChild(panel);
}

export function showAnalysisLoading(handlers?: AnalysisPanelHandlers): void {
  applyHandlers(handlers);
  saveBusy = false;
  saveDone = false;
  saveDismissed = false;
  listingBusy = false;
  listingChoice = null;
  render({ kind: "loading" });
}

export function showAnalysisError(
  message: string,
  handlers?: AnalysisPanelHandlers,
): void {
  applyHandlers(handlers);
  render({ kind: "error", message });
  logger.warn(SCOPE, message);
}

export function showAnalysisResult(
  analysis: JobAnalysisResponse,
  handlers?: AnalysisPanelHandlers,
): void {
  applyHandlers(handlers);
  saveBusy = false;
  saveDone = Boolean(analysis.descriptionPersisted);
  saveDismissed = false;
  listingBusy = false;
  listingChoice = null;
  render({ kind: "result", analysis });
}

export function hideAnalysisPanel(): void {
  document.getElementById(HOST_ID)?.remove();
  hostEl = null;
  shadow = null;
  onSaveDescription = null;
  onListJob = null;
  saveBusy = false;
  saveDone = false;
  saveDismissed = false;
  listingBusy = false;
  listingChoice = null;
}
