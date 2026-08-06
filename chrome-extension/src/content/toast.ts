/**
 * Content-script toast notifications.
 * Lightweight DOM toasts that never block the host page flow.
 */

import type { ToastPayload } from "@/types";

const HOST_ID = "aijh-toast-host";

function ensureHost(): HTMLElement {
  let host = document.getElementById(HOST_ID);
  if (host) return host;

  host = document.createElement("div");
  host.id = HOST_ID;
  Object.assign(host.style, {
    position: "fixed",
    top: "16px",
    right: "16px",
    zIndex: "2147483647",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    pointerEvents: "none",
    fontFamily: '"DM Sans", system-ui, sans-serif',
  });
  document.documentElement.appendChild(host);
  return host;
}

const COLORS: Record<ToastPayload["kind"], { bg: string; border: string; text: string }> = {
  success: { bg: "#ecfdf5", border: "#059669", text: "#064e3b" },
  error: { bg: "#fef2f2", border: "#dc2626", text: "#7f1d1d" },
  warning: { bg: "#fffbeb", border: "#d97706", text: "#78350f" },
  info: { bg: "#f0fdfa", border: "#0d9488", text: "#134e4a" },
};

export function showToast(payload: ToastPayload): void {
  const host = ensureHost();
  const colors = COLORS[payload.kind];
  const el = document.createElement("div");
  Object.assign(el.style, {
    pointerEvents: "auto",
    minWidth: "240px",
    maxWidth: "360px",
    padding: "12px 14px",
    borderRadius: "10px",
    background: colors.bg,
    border: `1px solid ${colors.border}`,
    color: colors.text,
    boxShadow: "0 8px 24px rgba(12, 18, 34, 0.12)",
    fontSize: "13px",
    lineHeight: "1.4",
    opacity: "0",
    transform: "translateY(-6px)",
    transition: "opacity 160ms ease, transform 160ms ease",
  });

  const title = document.createElement("div");
  title.textContent = payload.title;
  Object.assign(title.style, { fontWeight: "650", marginBottom: payload.message ? "2px" : "0" });
  el.appendChild(title);

  if (payload.message) {
    const msg = document.createElement("div");
    msg.textContent = payload.message;
    Object.assign(msg.style, { opacity: "0.9", fontSize: "12px" });
    el.appendChild(msg);
  }

  host.appendChild(el);
  requestAnimationFrame(() => {
    el.style.opacity = "1";
    el.style.transform = "translateY(0)";
  });

  window.setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(-6px)";
    window.setTimeout(() => el.remove(), 200);
  }, 4200);
}
