/**
 * Resume uploader.
 *
 * Locates `<input type="file">` controls and attaches a File via DataTransfer
 * so ATS frameworks that listen for change events accept the upload.
 */

import { logger } from "@/lib/logger";

const SCOPE = "uploader";

const ACCEPT_PDF = /pdf/i;
const ACCEPT_DOCX = /docx?|msword|officedocument/i;

export interface ResumePayload {
  filename: string;
  mimeType: string;
  base64: string;
}

function base64ToFile(payload: ResumePayload): File {
  const binary = atob(payload.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], payload.filename, {
    type: payload.mimeType || "application/pdf",
  });
}

function acceptsResume(input: HTMLInputElement): boolean {
  const accept = (input.getAttribute("accept") || "").toLowerCase();
  if (!accept) return true;
  if (accept.includes("*") || accept.includes("image")) {
    // Some boards list images + docs; still try
  }
  return (
    ACCEPT_PDF.test(accept) ||
    ACCEPT_DOCX.test(accept) ||
    accept.includes(".pdf") ||
    accept.includes(".doc") ||
    accept.includes("application/")
  );
}

/**
 * Find the most likely resume upload input on the page.
 */
export function findResumeInput(root: ParentNode = document): HTMLInputElement | null {
  const inputs = Array.from(
    root.querySelectorAll<HTMLInputElement>('input[type="file"]'),
  ).filter((el) => {
    if (el.disabled || el.hidden) return false;
    return acceptsResume(el);
  });

  if (inputs.length === 0) return null;

  // Prefer inputs whose label / name / nearby text mentions resume/cv
  const scored = inputs.map((el) => {
    const hay = [
      el.getAttribute("name") || "",
      el.getAttribute("id") || "",
      el.getAttribute("aria-label") || "",
      el.closest("label")?.textContent || "",
      el.labels?.[0]?.textContent || "",
    ]
      .join(" ")
      .toLowerCase();
    let score = 0;
    if (/resume|cv|curriculum/.test(hay)) score += 10;
    if (/cover.?letter/.test(hay)) score -= 5;
    if (acceptsResume(el)) score += 2;
    return { el, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.el ?? null;
}

/**
 * Attach a resume File to a file input and fire change events.
 */
export function attachFile(input: HTMLInputElement, file: File): boolean {
  try {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.classList.add("aijh-filled");
    window.setTimeout(() => input.classList.remove("aijh-filled"), 1600);
    logger.info(SCOPE, `Attached resume "${file.name}"`);
    return true;
  } catch (err) {
    logger.error(SCOPE, "Failed to attach resume", err);
    return false;
  }
}

/**
 * Full upload flow given a base64 resume payload from the background worker.
 */
export function uploadResume(payload: ResumePayload): {
  ok: boolean;
  error?: string;
} {
  const input = findResumeInput();
  if (!input) {
    return { ok: false, error: "No resume file input found on this page" };
  }
  const file = base64ToFile(payload);
  const ok = attachFile(input, file);
  return ok ? { ok: true } : { ok: false, error: "Failed to attach resume file" };
}
