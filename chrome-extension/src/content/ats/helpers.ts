/**
 * Shared helpers for lightweight ATS adapters.
 * Adapters improve labels / job metadata — they do not re-detect fields.
 *
 * Job extraction helpers prefer visible main content and avoid nav/footer/scripts.
 */

import { resolveLabel, resolveParentSection } from "@/content/detector";
import { categorizeField } from "@/lib/semantics";
import type { DetectedField } from "@/types";

const HIDDEN_SELECTOR =
  "script, style, noscript, svg, nav, footer, header, [aria-hidden='true'], [hidden]";

export function textOf(selector: string): string | undefined {
  const el = document.querySelector(selector);
  if (!(el instanceof HTMLElement) || !isVisible(el)) return undefined;
  const t = visibleText(el);
  return t || undefined;
}

/** First matching visible element's text across comma-separated selectors. */
export function textOfFirst(...selectors: string[]): string | undefined {
  for (const selector of selectors) {
    const t = textOf(selector);
    if (t) return t;
  }
  return undefined;
}

export function isVisible(el: HTMLElement): boolean {
  if (el.closest(HIDDEN_SELECTOR)) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  if (style.opacity === "0") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/** Visible text only — skips hidden children and script/style noise. */
export function visibleText(root: HTMLElement): string {
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(HIDDEN_SELECTOR).forEach((n) => n.remove());
  return clone.textContent?.replace(/\s+/g, " ").trim() || "";
}

/**
 * Extract description from the first matching visible container.
 * Falls back to the longest article/main block when selectors miss.
 */
export function extractDescription(...selectors: string[]): string | undefined {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (!(el instanceof HTMLElement) || !isVisible(el)) continue;
    const t = visibleText(el);
    if (t && t.length > 80) return t;
  }

  let best = "";
  for (const el of document.querySelectorAll(
    "article, main, [role='main'], .job-description, #job-description",
  )) {
    if (!(el instanceof HTMLElement) || !isVisible(el)) continue;
    const t = visibleText(el);
    if (t.length > best.length) best = t;
  }
  return best.length > 80 ? best : undefined;
}

const SECTION_HEADING_RE =
  /^(requirements?|qualifications?|responsibilities|what you.?ll do|about the (role|job)|benefits?|what we offer)\b/i;

/**
 * Pull section bodies under common headings (Requirements / Responsibilities).
 */
export function extractSections(): {
  requirements?: string;
  responsibilities?: string;
} {
  const result: { requirements?: string; responsibilities?: string } = {};
  const headings = document.querySelectorAll("h1, h2, h3, h4, strong, b");

  for (const heading of headings) {
    if (!(heading instanceof HTMLElement) || !isVisible(heading)) continue;
    const label = heading.textContent?.replace(/\s+/g, " ").trim() || "";
    if (!SECTION_HEADING_RE.test(label)) continue;

    const chunks: string[] = [];
    let sib: Element | null = heading.nextElementSibling;
    let steps = 0;
    while (sib && steps < 12) {
      if (/^H[1-4]$/i.test(sib.tagName)) break;
      if (sib instanceof HTMLElement && isVisible(sib)) {
        const t = visibleText(sib);
        if (t) chunks.push(t);
      }
      sib = sib.nextElementSibling;
      steps += 1;
    }
    const body = chunks.join("\n").trim();
    if (!body) continue;

    const lower = label.toLowerCase();
    if (/responsib|what you/.test(lower) && !result.responsibilities) {
      result.responsibilities = body;
    } else if (/require|qualif/.test(lower) && !result.requirements) {
      result.requirements = body;
    }
  }
  return result;
}

export function detectRemoteAndEmployment(location?: string): {
  remote?: boolean;
  employmentType?: string;
} {
  const bodyText = document.body.innerText.toLowerCase();
  const remote =
    /\bremote\b/.test(bodyText) || /\bremote\b/i.test(location || "")
      ? true
      : undefined;
  const employmentType = /\bfull[- ]?time\b/i.test(bodyText)
    ? "Full-time"
    : /\bpart[- ]?time\b/i.test(bodyText)
      ? "Part-time"
      : /\bintern(ship)?\b/i.test(bodyText)
        ? "Internship"
        : undefined;
  return { remote, employmentType };
}

/**
 * Soft content fingerprint for session scrape cache invalidation.
 */
export function descriptionFingerprint(description?: string): string {
  const len = (description || "").length;
  const sample = (description || "").slice(0, 64);
  return `${len}:${sample}`;
}

/**
 * Improve "Unknown Field" labels by looking at a nearby container selector.
 * Purely additive — never removes or replaces the generic field list.
 */
export function enrichLabelsFromContainers(
  fields: DetectedField[],
  containerSelector: string,
  labelSelector: string,
): DetectedField[] {
  return fields.map((field) => {
    if (field.label && field.label !== "Unknown Field" && field.canonicalKey) {
      return field;
    }

    const el = field.id
      ? document.getElementById(field.id)
      : field.name
        ? document.querySelector(`[name="${CSS.escape(field.name)}"]`)
        : null;
    if (!(el instanceof HTMLElement)) return field;

    const container = el.closest(containerSelector);
    const labelEl = container?.querySelector(labelSelector);
    const label = labelEl?.textContent
      ? labelEl.textContent.replace(/\s+/g, " ").replace(/\*$/, "").trim()
      : field.label !== "Unknown Field"
        ? field.label
        : resolveLabel(el);

    if (!label || label === field.label) return field;

    return {
      ...field,
      label,
      parentSection: field.parentSection || resolveParentSection(el),
      category: field.category || categorizeField(label),
    };
  });
}
