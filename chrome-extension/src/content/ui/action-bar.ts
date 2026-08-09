/**
 * Modular floating action bar (Shadow DOM) for supported ATS pages.
 *
 * Adding a future action = push into ACTIONS; no layout rewrite needed.
 */

import { detectAts } from "@/content/ats";
import { logger } from "@/lib/logger";

const SCOPE = "ui/action-bar";
const HOST_ID = "aijh-action-bar-host";

export type ActionId =
  | "analyze"
  | "analyze_selection"
  | "analyze_clipboard"
  | "autofill"
  | "save"
  | "cover_letter"
  | "recruiter_message"
  | "sponsorship"
  | "history"
  | "copy_description";

export interface ActionDef {
  id: ActionId;
  label: string;
  /** When false, button is shown disabled (slot for future features). */
  enabled?: boolean;
  primary?: boolean;
  onClick: () => void | Promise<void>;
}

let hostEl: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let actions: ActionDef[] = [];

const STYLES = `
:host {
  all: initial;
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
}
.wrap {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 2147483646;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  pointer-events: none;
}
.menu {
  display: none;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  background: #0f172a;
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(15, 23, 42, 0.35);
  pointer-events: auto;
  min-width: 200px;
}
.menu.open { display: flex; }
.btn {
  appearance: none;
  border: 0;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  color: #e2e8f0;
  background: transparent;
}
.btn:hover:not(:disabled) { background: #1e293b; }
.btn.primary {
  background: #0d9488;
  color: #fff;
}
.btn.primary:hover:not(:disabled) { background: #0f766e; }
.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.fab {
  pointer-events: auto;
  width: 52px;
  height: 52px;
  border-radius: 999px;
  border: 0;
  background: #0d9488;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.02em;
  cursor: pointer;
  box-shadow: 0 10px 28px rgba(13, 148, 136, 0.45);
}
.fab:hover { background: #0f766e; }
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

function render(): void {
  const root = ensureHost();
  root.innerHTML = "";
  const style = document.createElement("style");
  style.textContent = STYLES;
  root.appendChild(style);

  const wrap = document.createElement("div");
  wrap.className = "wrap";

  const menu = document.createElement("div");
  menu.className = "menu";
  menu.setAttribute("role", "menu");

  for (const action of actions) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = action.primary ? "btn primary" : "btn";
    btn.textContent = action.label;
    btn.disabled = action.enabled === false;
    btn.addEventListener("click", async () => {
      try {
        await action.onClick();
        menu.classList.remove("open");
      } catch (err) {
        logger.error(SCOPE, `Action ${action.id} failed`, err);
      }
    });
    menu.appendChild(btn);
  }

  const fab = document.createElement("button");
  fab.type = "button";
  fab.className = "fab";
  fab.title = "AI Job Hunter";
  fab.setAttribute("aria-label", "AI Job Hunter actions");
  fab.textContent = "AJH";
  fab.addEventListener("click", () => {
    menu.classList.toggle("open");
  });

  wrap.appendChild(menu);
  wrap.appendChild(fab);
  root.appendChild(wrap);
}

/**
 * Mount the action bar when on a supported ATS page.
 * Pass the actions to expose; call again to refresh handlers.
 */
export function mountActionBar(nextActions: ActionDef[]): void {
  if (detectAts() === "unknown") {
    removeActionBar();
    return;
  }
  actions = nextActions;
  render();
  logger.debug(SCOPE, "Action bar mounted", { count: actions.length });
}

export function removeActionBar(): void {
  document.getElementById(HOST_ID)?.remove();
  hostEl = null;
  shadow = null;
  actions = [];
}
