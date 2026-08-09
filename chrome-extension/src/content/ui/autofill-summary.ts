/**
 * In-page autofill summary panel (Shadow DOM).
 * Shown after rule-based fill when unresolved fields remain, and during/after AI.
 */

import type { AutofillValue } from "@/types";
import { logger } from "@/lib/logger";

const SCOPE = "ui/autofill-summary";
const HOST_ID = "aijh-autofill-summary-host";

export interface AutofillSummaryHandlers {
  onUseAi?: () => void | Promise<void>;
  /** Playwright CDP fallback — only after content-script autofill left gaps. */
  onUsePlaywright?: () => void | Promise<void>;
  onReview?: () => void;
  onCancel?: () => void;
  onConfirmSuggestion?: (value: AutofillValue) => void | Promise<void>;
  onSkipSuggestion?: (value: AutofillValue) => void;
}

type PanelState =
  | {
      kind: "summary";
      filled: number;
      unresolved: number;
      unresolvedLabels: string[];
    }
  | { kind: "loading" }
  | {
      kind: "ai-result";
      aiFilled: number;
      verify: number;
      pendingConfirm: AutofillValue[];
    }
  | { kind: "error"; message: string };

let hostEl: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let handlers: AutofillSummaryHandlers = {};

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
.stat {
  font-size: 14px;
  line-height: 1.5;
  margin: 0 0 6px;
  color: #334155;
}
.stat strong { font-weight: 700; color: #0f172a; }
.ok { color: #0f766e; }
.warn { color: #b45309; }
.hint {
  font-size: 12px;
  color: #64748b;
  margin: 10px 0 0;
  line-height: 1.4;
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
.list {
  margin: 10px 0 0;
  padding-left: 18px;
  font-size: 12px;
  color: #475569;
  max-height: 120px;
  overflow: auto;
}
.confirm-item {
  border: 1px solid #fecaca;
  background: #fef2f2;
  border-radius: 10px;
  padding: 10px;
  margin-top: 10px;
}
.confirm-item .label {
  font-size: 12px;
  font-weight: 600;
  color: #7f1d1d;
  margin: 0 0 4px;
}
.confirm-item .value {
  font-size: 13px;
  color: #334155;
  margin: 0 0 8px;
  word-break: break-word;
}
.confirm-item .actions {
  margin-top: 0;
}
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
`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

function render(state: PanelState): void {
  const root = ensureHost();
  root.innerHTML = "";
  const style = document.createElement("style");
  style.textContent = STYLES;
  root.appendChild(style);

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Autofill summary");

  const header = document.createElement("div");
  header.className = "header";
  header.innerHTML = `<h2 class="title">Autofill</h2>`;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "close";
  close.setAttribute("aria-label", "Close");
  close.textContent = "×";
  close.addEventListener("click", () => {
    handlers.onCancel?.();
    hideAutofillSummary();
  });
  header.appendChild(close);
  panel.appendChild(header);

  const body = document.createElement("div");
  body.className = "body";

  if (state.kind === "loading") {
    body.innerHTML = `<div class="loading"><div class="spinner"></div>Analyzing remaining fields...</div>`;
  } else if (state.kind === "error") {
    body.innerHTML = `<div class="error">${escapeHtml(state.message)}</div>`;
    const actions = document.createElement("div");
    actions.className = "actions";
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "secondary";
    dismiss.textContent = "Dismiss";
    dismiss.addEventListener("click", hideAutofillSummary);
    actions.appendChild(dismiss);
    body.appendChild(actions);
  } else if (state.kind === "summary") {
    body.innerHTML = `
      <p class="stat ok"><strong>✓ ${state.filled}</strong> fields completed</p>
      <p class="stat warn"><strong>⚠ ${state.unresolved}</strong> fields need attention</p>
      ${
        state.unresolvedLabels.length
          ? `<ul class="list">${state.unresolvedLabels
              .slice(0, 8)
              .map((l) => `<li>${escapeHtml(l)}</li>`)
              .join("")}${
              state.unresolvedLabels.length > 8
                ? `<li>…and ${state.unresolvedLabels.length - 8} more</li>`
                : ""
            }</ul>`
          : ""
      }
      <p class="hint">${state.unresolved} fields could not be identified.</p>
    `;
    const actions = document.createElement("div");
    actions.className = "actions";

    const aiBtn = document.createElement("button");
    aiBtn.type = "button";
    aiBtn.textContent = "Use AI to Complete Remaining Fields";
    aiBtn.addEventListener("click", () => {
      void handlers.onUseAi?.();
    });
    actions.appendChild(aiBtn);

    if (handlers.onUsePlaywright) {
      const pwBtn = document.createElement("button");
      pwBtn.type = "button";
      pwBtn.className = "secondary";
      pwBtn.textContent = "Retry with Browser Automation";
      pwBtn.addEventListener("click", () => {
        void handlers.onUsePlaywright?.();
      });
      actions.appendChild(pwBtn);
    }

    const reviewBtn = document.createElement("button");
    reviewBtn.type = "button";
    reviewBtn.className = "secondary";
    reviewBtn.textContent = "Review Remaining Fields";
    reviewBtn.addEventListener("click", () => handlers.onReview?.());
    actions.appendChild(reviewBtn);

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "secondary";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => {
      handlers.onCancel?.();
      hideAutofillSummary();
    });
    actions.appendChild(cancelBtn);
    body.appendChild(actions);
  } else {
    const reviewCount =
      state.verify + state.pendingConfirm.length;
    body.innerHTML = `
      <p class="stat ok">AI completed <strong>${state.aiFilled}</strong> additional fields.</p>
      ${
        state.verify
          ? `<p class="stat warn"><strong>${state.verify}</strong> filled with medium confidence — please verify.</p>`
          : ""
      }
      ${
        reviewCount
          ? `<p class="stat warn"><strong>${state.pendingConfirm.length}</strong> field(s) require manual review.</p>`
          : `<p class="hint">All AI suggestions were applied.</p>`
      }
    `;

    for (const suggestion of state.pendingConfirm) {
      const item = document.createElement("div");
      item.className = "confirm-item";
      const label = document.createElement("p");
      label.className = "label";
      label.textContent = suggestion.field;
      const value = document.createElement("p");
      value.className = "value";
      value.textContent = `Suggested: ${String(suggestion.value)}${
        suggestion.confidence != null
          ? ` (${Math.round(suggestion.confidence * 100)}%)`
          : ""
      }`;
      item.appendChild(label);
      item.appendChild(value);

      const row = document.createElement("div");
      row.className = "actions";
      const confirm = document.createElement("button");
      confirm.type = "button";
      confirm.textContent = "Confirm";
      confirm.addEventListener("click", () => {
        void handlers.onConfirmSuggestion?.(suggestion);
      });
      const skip = document.createElement("button");
      skip.type = "button";
      skip.className = "secondary";
      skip.textContent = "Skip";
      skip.addEventListener("click", () => handlers.onSkipSuggestion?.(suggestion));
      row.appendChild(confirm);
      row.appendChild(skip);
      item.appendChild(row);
      body.appendChild(item);
    }

    const actions = document.createElement("div");
    actions.className = "actions";
    const done = document.createElement("button");
    done.type = "button";
    done.className = "secondary";
    done.textContent = "Done";
    done.addEventListener("click", hideAutofillSummary);
    actions.appendChild(done);
    body.appendChild(actions);
  }

  panel.appendChild(body);
  root.appendChild(panel);
}

export function showAutofillSummary(
  filled: number,
  unresolvedLabels: string[],
  nextHandlers: AutofillSummaryHandlers,
): void {
  handlers = nextHandlers;
  logger.info(SCOPE, "Showing autofill summary", {
    filled,
    unresolved: unresolvedLabels.length,
  });
  render({
    kind: "summary",
    filled,
    unresolved: unresolvedLabels.length,
    unresolvedLabels,
  });
}

export function showAutofillAiLoading(
  nextHandlers?: AutofillSummaryHandlers,
  message = "Analyzing remaining fields...",
): void {
  if (nextHandlers) handlers = { ...handlers, ...nextHandlers };
  const root = ensureHost();
  // Reuse loading state but allow custom message via temporary render hack
  render({ kind: "loading" });
  const loading = root.querySelector(".loading");
  if (loading && message !== "Analyzing remaining fields...") {
    loading.innerHTML = `<div class="spinner"></div>${escapeHtml(message)}`;
  }
}

export function showAutofillAiResult(
  result: {
    aiFilled: number;
    verify: number;
    pendingConfirm: AutofillValue[];
  },
  nextHandlers?: AutofillSummaryHandlers,
): void {
  if (nextHandlers) handlers = { ...handlers, ...nextHandlers };
  render({
    kind: "ai-result",
    aiFilled: result.aiFilled,
    verify: result.verify,
    pendingConfirm: result.pendingConfirm,
  });
}

export function showAutofillAiError(
  message: string,
  nextHandlers?: AutofillSummaryHandlers,
): void {
  if (nextHandlers) handlers = { ...handlers, ...nextHandlers };
  render({ kind: "error", message });
}

export function hideAutofillSummary(): void {
  if (hostEl?.parentNode) hostEl.parentNode.removeChild(hostEl);
  hostEl = null;
  shadow = null;
  handlers = {};
}
