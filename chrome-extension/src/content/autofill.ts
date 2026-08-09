/**
 * Autofill engine (shared across all sites / ATS adapters).
 *
 * Writes values into form controls and dispatches the DOM events React /
 * Angular / Vue / Workday-style SPAs need. Highlights filled fields briefly;
 * marks low-confidence fields for manual review.
 *
 * Adapters must never reimplement this — they only enrich field metadata.
 */

import { findElement } from "@/content/detector";
import { logger } from "@/lib/logger";
import { normalizeLabel } from "@/lib/semantics";
import type { AutofillValue, DetectedField } from "@/types";

const SCOPE = "autofill";
const HIGHLIGHT_MS = 1600;

function dispatchInputEvents(el: HTMLElement): void {
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));
  el.dispatchEvent(new InputEvent("input", { bubbles: true, data: undefined }));
}

function setNativeValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  const proto =
    el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
  if (descriptor?.set) {
    descriptor.set.call(el, value);
  } else {
    el.value = value;
  }
}

function setNativeChecked(el: HTMLInputElement, checked: boolean): void {
  const descriptor = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "checked",
  );
  if (descriptor?.set) {
    descriptor.set.call(el, checked);
  } else {
    el.checked = checked;
  }
}

function highlight(
  el: HTMLElement,
  kind: "filled" | "review" | "ai-verify" | "ai-confirm",
): void {
  el.classList.remove(
    "aijh-filled",
    "aijh-review",
    "aijh-ai-verify",
    "aijh-ai-confirm",
  );
  const cls =
    kind === "filled"
      ? "aijh-filled"
      : kind === "review"
        ? "aijh-review"
        : kind === "ai-verify"
          ? "aijh-ai-verify"
          : "aijh-ai-confirm";
  el.classList.add(cls);
  if (kind === "ai-verify" || kind === "ai-confirm") {
    el.setAttribute(
      "title",
      kind === "ai-verify"
        ? "AI filled this field. Please verify."
        : "AI suggestion — confirm before using.",
    );
  }
  if (kind === "filled") {
    window.setTimeout(() => el.classList.remove(cls), HIGHLIGHT_MS);
  }
}

function truthy(value: string | number | boolean): boolean {
  if (typeof value === "boolean") return value;
  const s = String(value).trim().toLowerCase();
  return ["yes", "true", "1", "y", "on"].includes(s);
}

function falsy(value: string | number | boolean): boolean {
  if (typeof value === "boolean") return !value;
  const s = String(value).trim().toLowerCase();
  return ["no", "false", "0", "n", "off"].includes(s);
}

/** Normalize for fuzzy option matching (punctuation / spacing). */
function normOption(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function optionsMatch(candidate: string, target: string): boolean {
  const a = normOption(candidate);
  const b = normOption(target);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  // Token overlap for long EEO options ("I'm not a protected veteran…")
  const aTokens = new Set(a.split(" ").filter((t) => t.length > 2));
  const bTokens = b.split(" ").filter((t) => t.length > 2);
  if (bTokens.length >= 2) {
    const hits = bTokens.filter((t) => aTokens.has(t)).length;
    if (hits / bTokens.length >= 0.6) return true;
  }
  return false;
}

function fillTextLike(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string | number | boolean,
): boolean {
  setNativeValue(el, String(value));
  dispatchInputEvents(el);
  return true;
}

function fillSelect(el: HTMLSelectElement, value: string | number | boolean): boolean {
  const target = String(value).trim();
  let matched: HTMLOptionElement | null = null;

  for (const opt of Array.from(el.options)) {
    const label = (opt.textContent || "").trim();
    const val = opt.value.trim();
    if (
      optionsMatch(label, target) ||
      optionsMatch(val, target) ||
      (truthy(value) && (optionsMatch(label, "yes") || optionsMatch(val, "yes"))) ||
      (falsy(value) && (optionsMatch(label, "no") || optionsMatch(val, "no")))
    ) {
      matched = opt;
      break;
    }
  }

  if (!matched) return false;

  el.focus();
  const descriptor = Object.getOwnPropertyDescriptor(
    window.HTMLSelectElement.prototype,
    "value",
  );
  if (descriptor?.set) {
    descriptor.set.call(el, matched.value);
  } else {
    el.value = matched.value;
  }
  matched.selected = true;
  dispatchInputEvents(el);
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

/**
 * Toggle checkbox in a React/SPA-friendly way (prefer click; native setter fallback).
 */
function fillCheckbox(el: HTMLInputElement, value: string | number | boolean): boolean {
  const shouldCheck = truthy(value);
  if (el.checked === shouldCheck) {
    dispatchInputEvents(el);
    return true;
  }

  el.focus();
  // click() toggles — do not pre-set checked or the click will undo it.
  el.click();
  if (el.checked !== shouldCheck) {
    setNativeChecked(el, shouldCheck);
    dispatchInputEvents(el);
  }
  return el.checked === shouldCheck;
}

function radioOptionText(radio: HTMLInputElement): string {
  const id = radio.getAttribute("id");
  if (id) {
    const byFor = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    const t = (byFor?.textContent || "").trim();
    if (t && t.length < 100) return t;
  }
  const wrapping = radio.closest("label");
  if (wrapping) {
    const clone = wrapping.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("input, textarea, select, button").forEach((n) => n.remove());
    const t = (clone.textContent || "").trim();
    if (t && t.length < 100) return t;
  }
  const aria = (radio.getAttribute("aria-label") || "").trim();
  if (aria && aria.length < 100) return aria;
  const parent = radio.parentElement;
  if (parent) {
    const clone = parent.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("input, textarea, select, button").forEach((n) => n.remove());
    const t = (clone.textContent || "").trim();
    if (t && t.length < 100) return t;
  }
  return radio.value.trim();
}

function fillRadio(el: HTMLInputElement, value: string | number | boolean): boolean {
  const name = el.getAttribute("name");
  const group = name
    ? document.querySelectorAll<HTMLInputElement>(
        `input[type=radio][name="${CSS.escape(name)}"]`,
      )
    : ([el] as unknown as NodeListOf<HTMLInputElement>);

  const target = String(value).trim();
  let match: HTMLInputElement | null = null;

  for (const radio of Array.from(group)) {
    const label = radioOptionText(radio);
    const val = radio.value.trim();
    if (
      optionsMatch(label, target) ||
      optionsMatch(val, target) ||
      (truthy(value) &&
        (optionsMatch(label, "yes") ||
          optionsMatch(val, "yes") ||
          optionsMatch(val, "true") ||
          optionsMatch(val, "1"))) ||
      (falsy(value) &&
        (optionsMatch(label, "no") ||
          optionsMatch(val, "no") ||
          optionsMatch(val, "false") ||
          optionsMatch(val, "0")))
    ) {
      match = radio;
      break;
    }
  }

  if (!match) return false;
  if (match.checked) {
    dispatchInputEvents(match);
    return true;
  }

  match.focus();
  // click() selects the radio — do not pre-set checked.
  match.click();
  if (!match.checked) {
    setNativeChecked(match, true);
    dispatchInputEvents(match);
  }
  return match.checked;
}

function findOptionElements(root: ParentNode = document): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      '[role="option"], [role="menuitem"], [role="menuitemradio"], li[data-value], div[data-value]',
    ),
  );
}

/**
 * Fill ARIA combobox / searchable dropdown.
 * Click open → type → click matching option (page-wide search).
 */
function fillCombobox(el: HTMLElement, value: string | number | boolean): boolean {
  const text = String(value);
  const target = text.trim();

  const input =
    el instanceof HTMLInputElement
      ? el
      : el.querySelector("input") ||
        (document.getElementById(el.getAttribute("aria-controls") || "") as HTMLElement | null);

  // Open the list
  el.click();
  if (input instanceof HTMLElement && input !== el) {
    input.click();
  }

  if (input instanceof HTMLInputElement) {
    setNativeValue(input, text);
    dispatchInputEvents(input);
  } else if (el.isContentEditable) {
    el.textContent = text;
    dispatchInputEvents(el);
  } else {
    el.setAttribute("aria-valuetext", text);
    if ("value" in el) {
      (el as HTMLInputElement).value = text;
    }
    dispatchInputEvents(el);
  }

  el.dispatchEvent(
    new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
  );

  const listId = el.getAttribute("aria-controls") || el.getAttribute("aria-owns");
  const list = listId ? document.getElementById(listId) : null;
  const scoped = list ? findOptionElements(list) : [];
  const options = scoped.length ? scoped : findOptionElements(document);

  for (const opt of options) {
    const label = (opt.textContent || "").trim();
    const dataVal = opt.getAttribute("data-value") || "";
    if (
      optionsMatch(label, target) ||
      optionsMatch(dataVal, target) ||
      (truthy(value) && optionsMatch(label, "yes")) ||
      (falsy(value) && optionsMatch(label, "no"))
    ) {
      opt.click();
      dispatchInputEvents(el);
      if (input instanceof HTMLElement) dispatchInputEvents(input);
      return true;
    }
  }

  // Last resort: Enter to accept typed value
  el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  return true;
}

function fillContentEditable(el: HTMLElement, value: string | number | boolean): boolean {
  el.focus();
  el.textContent = String(value);
  dispatchInputEvents(el);
  return true;
}

/**
 * Apply a single autofill value to its matching detected field.
 */
export function applyValue(
  field: DetectedField,
  value: AutofillValue,
  opts: { review?: boolean; highlightKind?: "filled" | "ai-verify" } = {},
): boolean {
  const el = findElement(field);
  if (!el) {
    logger.warn(SCOPE, `Element not found for "${field.label}"`);
    return false;
  }

  if (opts.review) {
    highlight(el, "review");
    return false;
  }

  let ok: boolean;
  try {
    if (field.type === "combobox" || el.getAttribute("role") === "combobox") {
      ok = fillCombobox(el, value.value);
    } else if (
      field.type === "contenteditable" ||
      el.isContentEditable
    ) {
      ok = fillContentEditable(el, value.value);
    } else if (el instanceof HTMLSelectElement || field.type === "select") {
      ok =
        el instanceof HTMLSelectElement
          ? fillSelect(el, value.value)
          : fillCombobox(el, value.value);
    } else if (el instanceof HTMLTextAreaElement) {
      ok = fillTextLike(el, value.value);
    } else if (el instanceof HTMLInputElement) {
      switch (field.type) {
        case "checkbox":
          ok = fillCheckbox(el, value.value);
          break;
        case "radio":
          ok = fillRadio(el, value.value);
          break;
        case "file":
          ok = false;
          break;
        default:
          // Some detectors mis-tag radios/checkboxes as text
          if (el.type === "checkbox") ok = fillCheckbox(el, value.value);
          else if (el.type === "radio") ok = fillRadio(el, value.value);
          else ok = fillTextLike(el, value.value);
      }
    } else if (field.type === "checkbox" || field.type === "radio") {
      // Custom role-based widgets
      ok = fillCombobox(el, value.value);
    } else {
      ok = fillCombobox(el, value.value);
    }
  } catch (err) {
    logger.error(SCOPE, `Failed to fill "${field.label}"`, err);
    return false;
  }

  if (ok) highlight(el, opts.highlightKind ?? "filled");
  return ok;
}

export interface AutofillResult {
  filled: number;
  reviewed: number;
  failed: number;
  missingRequired: string[];
}

function resolveField(
  fields: DetectedField[],
  value: AutofillValue & { uid?: string; selector?: string },
): DetectedField | undefined {
  if (value.uid) {
    const byUid = fields.find((f) => f.uid === value.uid);
    if (byUid) return byUid;
  }
  if (value.canonicalKey) {
    const byKey = fields.find((f) => f.canonicalKey === value.canonicalKey);
    if (byKey) return byKey;
  }
  if (value.selector) {
    const bySel = fields.find((f) => f.selector === value.selector);
    if (bySel) return bySel;
  }
  const needle = normalizeLabel(value.field);
  return (
    fields.find((f) => normalizeLabel(f.label) === needle) ||
    fields.find(
      (f) =>
        normalizeLabel(f.label).includes(needle) ||
        needle.includes(normalizeLabel(f.label)),
    )
  );
}

function isAlreadyFilled(field: DetectedField): boolean {
  const el = findElement(field);
  if (!el) return false;
  if (el instanceof HTMLInputElement) {
    if (el.type === "checkbox" || el.type === "radio") return el.checked;
    return Boolean(el.value?.trim());
  }
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    return Boolean(String(el.value || "").trim());
  }
  if (el.isContentEditable) {
    return Boolean(el.textContent?.trim());
  }
  return false;
}

export interface AiAutofillResult {
  filled: number;
  verify: number;
  pendingConfirm: AutofillValue[];
  failed: number;
}

/** Confidence bands for AI autofill (see plan). */
export const AI_CONFIDENCE_HIGH = 0.9;
export const AI_CONFIDENCE_MED = 0.7;

/**
 * Apply AI-suggested values with confidence banding.
 * Never overwrites fields that already have a value.
 */
export function applyAiAutofillValues(
  fields: DetectedField[],
  values: Array<AutofillValue & { uid?: string; selector?: string; explanation?: string }>,
): AiAutofillResult {
  let filled = 0;
  let verify = 0;
  let failed = 0;
  const pendingConfirm: AutofillValue[] = [];

  for (const v of values) {
    const field = resolveField(fields, v);
    if (!field) {
      failed += 1;
      continue;
    }
    if (isAlreadyFilled(field)) {
      continue;
    }

    if (v.confidence < AI_CONFIDENCE_MED) {
      const el = findElement(field);
      if (el) highlight(el, "ai-confirm");
      pendingConfirm.push({ ...v, field: field.label, needsReview: true });
      continue;
    }

    const highlightKind =
      v.confidence < AI_CONFIDENCE_HIGH ? "ai-verify" : "filled";
    if (applyValue(field, v, { highlightKind })) {
      if (highlightKind === "ai-verify") verify += 1;
      else filled += 1;
    } else {
      failed += 1;
    }
  }

  return { filled, verify, pendingConfirm, failed };
}

/**
 * Confirm and fill a previously deferred low-confidence AI suggestion.
 */
export function confirmAiSuggestion(
  fields: DetectedField[],
  value: AutofillValue & { uid?: string; selector?: string },
): boolean {
  const field = resolveField(fields, value);
  if (!field || isAlreadyFilled(field)) return false;
  return applyValue(field, value, { highlightKind: "ai-verify" });
}

/**
 * Fill all provided values against the detected field list.
 */
export function autofillFields(
  fields: DetectedField[],
  values: AutofillValue[],
  review: AutofillValue[] = [],
): AutofillResult {
  let filled = 0;
  let reviewed = 0;
  let failed = 0;

  for (const v of values) {
    const field = resolveField(fields, v);
    if (!field) {
      failed += 1;
      continue;
    }
    if (applyValue(field, v)) filled += 1;
    else failed += 1;
  }

  for (const v of review) {
    const field = resolveField(fields, v);
    if (field) {
      applyValue(field, v, { review: true });
      reviewed += 1;
    }
  }

  const missingRequired = fields
    .filter((f) => f.required && f.type !== "file")
    .filter((f) => {
      const el = findElement(f);
      if (!el) return true;
      if (el instanceof HTMLInputElement && el.type === "checkbox") return false;
      if ("value" in el && !(el as HTMLInputElement).value) return true;
      return false;
    })
    .map((f) => f.label);

  logger.info(SCOPE, `Autofill complete`, { filled, reviewed, failed, missingRequired });
  return { filled, reviewed, failed, missingRequired };
}
