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

function highlight(el: HTMLElement, kind: "filled" | "review"): void {
  const cls = kind === "filled" ? "aijh-filled" : "aijh-review";
  el.classList.add(cls);
  if (kind === "filled") {
    window.setTimeout(() => el.classList.remove(cls), HIGHLIGHT_MS);
  }
}

function truthy(value: string | number | boolean): boolean {
  if (typeof value === "boolean") return value;
  const s = String(value).trim().toLowerCase();
  return ["yes", "true", "1", "y", "on"].includes(s);
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
  const target = String(value).trim().toLowerCase();
  let matched = false;
  for (const opt of Array.from(el.options)) {
    const label = (opt.textContent || "").trim().toLowerCase();
    const val = opt.value.trim().toLowerCase();
    if (
      label === target ||
      val === target ||
      label.includes(target) ||
      (target.length > 2 && target.includes(label))
    ) {
      el.value = opt.value;
      matched = true;
      break;
    }
  }
  if (matched) dispatchInputEvents(el);
  return matched;
}

function fillCheckbox(el: HTMLInputElement, value: string | number | boolean): boolean {
  const shouldCheck = truthy(value);
  if (el.checked !== shouldCheck) {
    el.checked = shouldCheck;
    dispatchInputEvents(el);
  }
  return true;
}

function fillRadio(el: HTMLInputElement, value: string | number | boolean): boolean {
  const name = el.getAttribute("name");
  if (!name) return false;
  const target = String(value).trim().toLowerCase();
  const group = document.querySelectorAll<HTMLInputElement>(
    `input[type=radio][name="${CSS.escape(name)}"]`,
  );
  for (const radio of group) {
    const label = radio.labels?.[0]?.textContent?.trim().toLowerCase() ?? "";
    const val = radio.value.trim().toLowerCase();
    if (
      label === target ||
      val === target ||
      label.includes(target) ||
      (truthy(value) && val === "yes")
    ) {
      radio.checked = true;
      dispatchInputEvents(radio);
      return true;
    }
  }
  return false;
}

/**
 * Fill ARIA combobox / searchable dropdown.
 * Strategy: type into the input (if present), then click a matching option.
 */
function fillCombobox(el: HTMLElement, value: string | number | boolean): boolean {
  const text = String(value);
  const input =
    el instanceof HTMLInputElement
      ? el
      : el.querySelector("input") ||
        (document.getElementById(el.getAttribute("aria-controls") || "") as HTMLElement | null);

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

  // Expand and try to select a matching option
  el.dispatchEvent(
    new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
  );
  const listId = el.getAttribute("aria-controls") || el.getAttribute("aria-owns");
  const list = listId ? document.getElementById(listId) : null;
  const options = list?.querySelectorAll('[role="option"], li') ?? [];
  const target = text.trim().toLowerCase();
  for (const opt of options) {
    const label = (opt.textContent || "").trim().toLowerCase();
    if (label === target || label.includes(target)) {
      (opt as HTMLElement).click();
      return true;
    }
  }
  return true; // typed value even if option click missed
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
  opts: { review?: boolean } = {},
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
    } else if (el instanceof HTMLSelectElement) {
      ok = fillSelect(el, value.value);
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
          ok = fillTextLike(el, value.value);
      }
    } else {
      // Generic fallback for custom widgets
      ok = fillCombobox(el, value.value);
    }
  } catch (err) {
    logger.error(SCOPE, `Failed to fill "${field.label}"`, err);
    return false;
  }

  if (ok) highlight(el, "filled");
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
  value: AutofillValue,
): DetectedField | undefined {
  if (value.canonicalKey) {
    const byKey = fields.find((f) => f.canonicalKey === value.canonicalKey);
    if (byKey) return byKey;
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
