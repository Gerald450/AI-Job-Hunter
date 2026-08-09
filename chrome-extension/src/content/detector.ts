/**
 * Generic Semantic Field Detection Engine
 * ========================================
 *
 * PRIMARY source of truth for form discovery on ANY job-application page.
 * ATS adapters may enrich metadata afterward — they must never replace this.
 *
 * Discovers:
 *   - native input / textarea / select / checkbox / radio / file
 *   - ARIA comboboxes and listboxes
 *   - contenteditable controls
 *   - searchable dropdown triggers commonly used by ATS SPAs
 *
 * For every field, collects rich semantic signals (labels, ARIA, nearby text,
 * section headings, validation messages) so the backend / mapping layer can
 * infer meaning without brittle CSS selectors.
 */

import { categorizeField } from "@/lib/semantics";
import { logger } from "@/lib/logger";
import type { DetectedField, FieldOption, FieldType } from "@/types";

const SCOPE = "detector";

const NATIVE_SELECTOR = [
  "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image])",
  "textarea",
  "select",
].join(", ");

const ARIA_WIDGET_SELECTOR = [
  '[role="combobox"]',
  '[role="listbox"]',
  '[role="textbox"]',
  '[role="searchbox"]',
  '[contenteditable="true"]',
  '[contenteditable=""]',
].join(", ");

/** Prefer application form roots over the full document when present. */
const APPLICATION_ROOT_SELECTOR = [
  "form",
  "main",
  '[role="main"]',
  '[data-automation-id*="application"]',
  '[data-test*="application"]',
  ".application-form",
  "#application-form",
  "#application",
].join(", ");

const NOISE_LABEL_RE =
  /\b(deepseek|chatgpt|claude|gemini|copilot|ai\s*sidebar|ai\s*assistant|ask\s*(chatgpt|ai|assistant)|grammarly|otter\.ai|monica|sider|merlin)\b/i;

const NOISE_ATTR_RE =
  /deepseek|chatgpt|claude|gemini|copilot|grammarly|monica|sider|merlin|ai[-_]?sidebar|ai[-_]?assistant|chat[-_]?widget/i;

/**
 * Skip third-party chat/AI sidebars and other non-application chrome that
 * often inject contenteditable / role=textbox into the light DOM.
 */
export function isIgnoredField(el: HTMLElement): boolean {
  if (el.closest("[data-ai-job-hunter], #ai-job-hunter-root")) return true;

  const attrs = [
    el.id,
    el.className && typeof el.className === "string" ? el.className : "",
    el.getAttribute("aria-label") || "",
    el.getAttribute("name") || "",
    el.getAttribute("data-testid") || "",
    el.getAttribute("data-automation-id") || "",
  ].join(" ");
  if (NOISE_ATTR_RE.test(attrs)) return true;

  const ancestor = el.closest(
    [
      "[id*='deepseek']",
      "[class*='deepseek']",
      "[id*='chatgpt']",
      "[class*='chatgpt']",
      "[class*='ai-sidebar']",
      "[class*='ai_sidebar']",
      "[class*='chat-widget']",
      "[data-extension]",
    ].join(", "),
  );
  if (ancestor) return true;

  // Walk a few parents for noisy class/id tokens (case-insensitive).
  let node: HTMLElement | null = el.parentElement;
  for (let i = 0; i < 6 && node; i += 1) {
    const blob = `${node.id} ${typeof node.className === "string" ? node.className : ""}`;
    if (NOISE_ATTR_RE.test(blob)) return true;
    node = node.parentElement;
  }

  // Fixed / sticky high z-index panels that are not part of the form
  try {
    const style = window.getComputedStyle(el);
    const position = style.position;
    if (position === "fixed" || position === "sticky") {
      const z = Number.parseInt(style.zIndex || "0", 10);
      if (Number.isFinite(z) && z >= 1000) {
        // Allow fixed form footers that contain real inputs inside a form
        if (!el.closest("form")) return true;
      }
    }
  } catch {
    /* ignore */
  }

  return false;
}

function labelLooksLikeNoise(label: string): boolean {
  return NOISE_LABEL_RE.test(label);
}

function detectionRoots(root: ParentNode): ParentNode[] {
  if (root !== document && !(root instanceof Document)) {
    return [root];
  }
  const scoped = Array.from(
    document.querySelectorAll<HTMLElement>(APPLICATION_ROOT_SELECTOR),
  ).filter((el) => isVisible(el));
  if (scoped.length > 0) return scoped;
  return [document];
}

function cleanText(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(/\s+/g, " ").replace(/\*+$/, "").trim();
}

function truncate(s: string, max = 240): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** Generate a stable-ish uid for an element within the current document. */
export function fieldUid(el: Element, index: number): string {
  const id = el.getAttribute("id") || "";
  const name = el.getAttribute("name") || "";
  const role = el.getAttribute("role") || "";
  const tag = el.tagName.toLowerCase();
  return `${tag}:${role}:${id || name || "anon"}:${index}`;
}

function mapNativeType(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
): FieldType {
  if (el instanceof HTMLTextAreaElement) return "textarea";
  if (el instanceof HTMLSelectElement) return "select";
  const t = (el.type || "text").toLowerCase();
  switch (t) {
    case "email":
      return "email";
    case "tel":
      return "tel";
    case "url":
      return "url";
    case "number":
      return "number";
    case "date":
    case "datetime-local":
    case "month":
    case "week":
      return "date";
    case "password":
      return "password";
    case "checkbox":
      return "checkbox";
    case "radio":
      return "radio";
    case "file":
      return "file";
    case "hidden":
      return "hidden";
    default:
      return "text";
  }
}

function mapWidgetType(el: HTMLElement): FieldType {
  const role = (el.getAttribute("role") || "").toLowerCase();
  if (role === "combobox" || role === "listbox") return "combobox";
  if (el.isContentEditable || el.getAttribute("contenteditable") !== null) {
    return "contenteditable";
  }
  if (role === "textbox" || role === "searchbox") return "text";
  // Heuristic: button-like dropdowns used by Workday / custom SPAs
  if (
    el.getAttribute("aria-haspopup") === "listbox" ||
    el.getAttribute("aria-haspopup") === "true"
  ) {
    return "combobox";
  }
  return "unknown";
}

function resolveAriaRefs(attr: string | null): string {
  if (!attr) return "";
  return attr
    .split(/\s+/)
    .map((id) => cleanText(document.getElementById(id)?.textContent))
    .filter(Boolean)
    .join(" ");
}

/**
 * Resolve the best human-readable label for a form control using semantic
 * signals only — never CSS class name matching.
 */
export function resolveLabel(el: HTMLElement): string {
  const id = el.getAttribute("id");
  if (id) {
    const byFor = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    const t = cleanText(byFor?.textContent);
    if (t) return t;
  }

  const wrapping = el.closest("label");
  if (wrapping) {
    const clone = wrapping.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("input, textarea, select, button").forEach((n) => n.remove());
    const t = cleanText(clone.textContent);
    if (t) return t;
  }

  const aria = cleanText(el.getAttribute("aria-label"));
  if (aria) return aria;

  const labelledBy = resolveAriaRefs(el.getAttribute("aria-labelledby"));
  if (labelledBy) return labelledBy;

  // Closest explicit field container label (generic, not ATS-specific)
  const container = el.closest(
    "fieldset, [role='group'], [role='radiogroup'], li, .form-group, [data-automation-id]",
  );
  if (container) {
    const legend = container.querySelector(":scope > legend, :scope > label");
    const t = cleanText(legend?.textContent);
    if (t && t.length < 160) return t;
  }

  // Preceding sibling text
  const prev = el.previousElementSibling;
  if (prev && /^(LABEL|SPAN|DIV|P|LEGEND|H[1-6]|STRONG)$/i.test(prev.tagName)) {
    const t = cleanText(prev.textContent);
    if (t && t.length < 120) return t;
  }

  const placeholder = cleanText(el.getAttribute("placeholder"));
  if (placeholder) return placeholder;

  const name = el.getAttribute("name");
  if (name) return cleanText(name.replace(/[_-]+/g, " "));

  const elId = el.getAttribute("id");
  if (elId) return cleanText(elId.replace(/[_-]+/g, " "));

  return "Unknown Field";
}

/** Walk up the DOM for the nearest section / heading context. */
export function resolveParentSection(el: HTMLElement): string | undefined {
  let node: HTMLElement | null = el.parentElement;
  let depth = 0;
  while (node && depth < 12) {
    if (node.tagName === "FIELDSET") {
      const legend = cleanText(node.querySelector("legend")?.textContent);
      if (legend) return legend;
    }
    const heading = node.querySelector(
      ":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > legend, :scope > [role='heading']",
    );
    const t = cleanText(heading?.textContent);
    if (t && t.length < 120) return t;

    const sectionLabel =
      cleanText(node.getAttribute("aria-label")) ||
      resolveAriaRefs(node.getAttribute("aria-labelledby"));
    if (sectionLabel && sectionLabel.length < 120) return sectionLabel;

    if (/^(SECTION|ARTICLE|FORM)$/i.test(node.tagName)) {
      const h = node.querySelector("h1, h2, h3, h4");
      const ht = cleanText(h?.textContent);
      if (ht) return ht;
    }

    node = node.parentElement;
    depth += 1;
  }
  return undefined;
}

/** Collect instructional / help text near a control. */
export function resolveNearbyText(el: HTMLElement): string | undefined {
  const chunks: string[] = [];

  const described = resolveAriaRefs(el.getAttribute("aria-describedby"));
  if (described) chunks.push(described);

  const container = el.closest("fieldset, li, [role='group'], label, div");
  if (container) {
    const hints = container.querySelectorAll(
      "small, .help, .hint, .description, [class*='help'], [class*='hint'], [class*='description'], p",
    );
    hints.forEach((h) => {
      const t = cleanText(h.textContent);
      if (t && t.length < 200 && t !== resolveLabel(el)) chunks.push(t);
    });
  }

  const unique = [...new Set(chunks)].filter(Boolean);
  return unique.length ? truncate(unique.join(" · ")) : undefined;
}

/** Visible validation / error message associated with the control. */
export function resolveValidationMessage(el: HTMLElement): string | undefined {
  const errId = el.getAttribute("aria-errormessage");
  if (errId) {
    const t = cleanText(document.getElementById(errId)?.textContent);
    if (t) return t;
  }
  if (el.getAttribute("aria-invalid") === "true") {
    const described = resolveAriaRefs(el.getAttribute("aria-describedby"));
    if (described) return described;
  }
  // Native Constraint Validation API
  if (
    (el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement) &&
    el.validationMessage
  ) {
    return el.validationMessage;
  }
  const container = el.closest("fieldset, li, div, label");
  const err = container?.querySelector(
    '[role="alert"], .error, .invalid, [class*="error"], [class*="invalid"]',
  );
  const t = cleanText(err?.textContent);
  return t || undefined;
}

function readSelectOptions(el: HTMLSelectElement): FieldOption[] {
  return Array.from(el.options).map((opt) => ({
    label: cleanText(opt.textContent) || opt.value,
    value: opt.value,
  }));
}

function readRadioOptions(el: HTMLInputElement): FieldOption[] | undefined {
  const name = el.getAttribute("name");
  if (!name) return undefined;
  const group = document.querySelectorAll<HTMLInputElement>(
    `input[type=radio][name="${CSS.escape(name)}"]`,
  );
  return Array.from(group).map((radio) => ({
    label: radioOptionLabel(radio),
    value: radio.value,
  }));
}

/** Prefer the option's own Yes/No-style label over the shared question text. */
function radioOptionLabel(radio: HTMLInputElement): string {
  const id = radio.getAttribute("id");
  if (id) {
    const byFor = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    const t = cleanText(byFor?.textContent);
    if (t && t.length < 80) return t;
  }
  const wrapping = radio.closest("label");
  if (wrapping) {
    const clone = wrapping.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("input, textarea, select, button").forEach((n) => n.remove());
    const t = cleanText(clone.textContent);
    if (t && t.length < 80) return t;
  }
  const aria = cleanText(radio.getAttribute("aria-label"));
  if (aria && aria.length < 80) return aria;
  // Sibling text (common ATS pattern: <input/><span>Yes</span>)
  const parent = radio.parentElement;
  if (parent) {
    const clone = parent.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("input, textarea, select, button").forEach((n) => n.remove());
    const t = cleanText(clone.textContent);
    if (t && t.length < 80) return t;
  }
  return cleanText(radio.value) || "option";
}

function readComboboxOptions(el: HTMLElement): FieldOption[] | undefined {
  const listId = el.getAttribute("aria-controls") || el.getAttribute("aria-owns");
  if (!listId) return undefined;
  const list = document.getElementById(listId);
  if (!list) return undefined;
  const options = list.querySelectorAll('[role="option"], li, option');
  if (options.length === 0) return undefined;
  return Array.from(options)
    .map((opt) => ({
      label: cleanText(opt.textContent),
      value: (opt as HTMLElement).dataset.value || cleanText(opt.textContent),
    }))
    .filter((o) => o.label);
}

function currentValue(el: HTMLElement, type: FieldType): string | undefined {
  if (type === "checkbox" && el instanceof HTMLInputElement) {
    return el.checked ? "true" : "false";
  }
  if (type === "file") return undefined;
  if (type === "contenteditable") {
    return cleanText(el.textContent) || undefined;
  }
  if (type === "combobox") {
    return (
      cleanText(el.getAttribute("aria-valuetext")) ||
      cleanText(el.textContent) ||
      (el instanceof HTMLInputElement ? el.value : undefined) ||
      undefined
    );
  }
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  ) {
    return el.value || undefined;
  }
  return undefined;
}

function isVisible(el: HTMLElement): boolean {
  // File inputs are often visually hidden behind custom dropzones — still detect them.
  if (el instanceof HTMLInputElement && el.type === "file") {
    return !isDisabled(el);
  }
  if (el.hidden || el.getAttribute("aria-hidden") === "true") return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    return false;
  }
  return true;
}

function isDisabled(el: HTMLElement): boolean {
  if (el.getAttribute("disabled") !== null) return true;
  if (el.getAttribute("aria-disabled") === "true") return true;
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    el instanceof HTMLButtonElement
  ) {
    return el.disabled;
  }
  return false;
}

function cssPathHint(el: Element): string {
  if (el.id) return `#${CSS.escape(el.id)}`;
  const name = el.getAttribute("name");
  if (name) return `${el.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
  const role = el.getAttribute("role");
  if (role) return `${el.tagName.toLowerCase()}[role="${role}"]`;
  return el.tagName.toLowerCase();
}

function buildField(el: HTMLElement, type: FieldType, index: number): DetectedField {
  const label = resolveLabel(el);
  const ariaLabel = cleanText(el.getAttribute("aria-label")) || undefined;
  const ariaLabelledBy =
    resolveAriaRefs(el.getAttribute("aria-labelledby")) || undefined;
  const ariaDescribedBy =
    resolveAriaRefs(el.getAttribute("aria-describedby")) || undefined;
  const parentSection = resolveParentSection(el);
  const nearbyText = resolveNearbyText(el);
  const validationMessage = resolveValidationMessage(el);

  const field: DetectedField = {
    uid: fieldUid(el, index),
    label,
    name: el.getAttribute("name") || undefined,
    id: el.getAttribute("id") || undefined,
    placeholder: cleanText(el.getAttribute("placeholder")) || undefined,
    ariaLabel,
    ariaLabelledBy,
    ariaDescribedBy,
    role: el.getAttribute("role") || undefined,
    type,
    required:
      el.hasAttribute("required") || el.getAttribute("aria-required") === "true",
    currentValue: currentValue(el, type),
    parentSection,
    nearbyText,
    validationMessage,
    cssClasses: el.className && typeof el.className === "string" ? el.className : undefined,
    category: categorizeField(label, ariaLabel, nearbyText, parentSection),
    selector: cssPathHint(el),
  };

  if (el instanceof HTMLSelectElement) {
    field.options = readSelectOptions(el);
  } else if (type === "radio" && el instanceof HTMLInputElement) {
    field.options = readRadioOptions(el);
  } else if (type === "combobox") {
    field.options = readComboboxOptions(el);
  }

  return field;
}

/**
 * Collect every detectable interactive field under `root`.
 * This is the primary detection path for all sites (known ATS or unknown).
 */
export function detectFields(root: ParentNode = document): DetectedField[] {
  const fields: DetectedField[] = [];
  const seen = new WeakSet<Element>();
  const seenRadios = new Set<string>();
  let index = 0;

  const roots = detectionRoots(root);

  for (const scope of roots) {
    const nativeNodes = Array.from(
      scope.querySelectorAll<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >(NATIVE_SELECTOR),
    );

    for (const el of nativeNodes) {
      if (seen.has(el) || !isVisible(el) || isDisabled(el) || isIgnoredField(el)) {
        continue;
      }
      seen.add(el);

      const type = mapNativeType(el);
      if (type === "radio") {
        const name = el.getAttribute("name") || fieldUid(el, index);
        if (seenRadios.has(name)) continue;
        seenRadios.add(name);
      }

      const field = buildField(el, type, index++);
      if (labelLooksLikeNoise(field.label)) continue;
      fields.push(field);
    }

    // ARIA widgets / contenteditable / custom comboboxes not already covered
    const widgets = Array.from(
      scope.querySelectorAll<HTMLElement>(ARIA_WIDGET_SELECTOR),
    );

    // Also pick up elements that look like searchable dropdowns (generic heuristic)
    const dropdownTriggers = Array.from(
      scope.querySelectorAll<HTMLElement>(
        '[aria-haspopup="listbox"], [aria-haspopup="true"][aria-expanded], [data-automation-id*="select"], [data-automation-id*="dropdown"]',
      ),
    );

    for (const el of [...widgets, ...dropdownTriggers]) {
      if (seen.has(el) || !isVisible(el) || isDisabled(el) || isIgnoredField(el)) {
        continue;
      }
      // Skip if this widget wraps / is a native control we already captured
      if (el.matches(NATIVE_SELECTOR)) continue;
      if (el.querySelector(NATIVE_SELECTOR) && el.getAttribute("role") !== "combobox") {
        continue;
      }
      seen.add(el);
      const type = mapWidgetType(el);
      if (type === "unknown") continue;
      const field = buildField(el, type, index++);
      if (labelLooksLikeNoise(field.label)) continue;
      fields.push(field);
    }
  }

  logger.debug(SCOPE, `Detected ${fields.length} fields (generic engine)`);
  return fields;
}

/**
 * Locate a DOM element corresponding to a previously detected field.
 * Prefers semantic identity (id → name → label) over brittle selectors.
 */
export function findElement(field: DetectedField): HTMLElement | null {
  if (field.id) {
    const byId = document.getElementById(field.id);
    if (byId) return byId;
  }
  if (field.name) {
    const byName = document.querySelector<HTMLElement>(
      `[name="${CSS.escape(field.name)}"]`,
    );
    if (byName) return byName;
  }

  const all = document.querySelectorAll<HTMLElement>(
    `${NATIVE_SELECTOR}, ${ARIA_WIDGET_SELECTOR}, [aria-haspopup]`,
  );
  for (const el of all) {
    if (resolveLabel(el) === field.label) return el;
  }

  if (field.selector) {
    try {
      const bySel = document.querySelector<HTMLElement>(field.selector);
      if (bySel) return bySel;
    } catch {
      /* invalid selector */
    }
  }
  return null;
}
