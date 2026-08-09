/**
 * Field-label mapping utilities.
 *
 * Uses the configurable semantic alias registry (lib/semantics) so profile
 * keys and backend responses match detected fields by meaning, not by ID.
 */

import { findElement } from "@/content/detector";
import {
  CANONICAL_TO_PROFILE,
  inferCanonicalKey,
  normalizeLabel,
} from "@/lib/semantics";
import type { AutofillValue, DetectedField, UserProfile } from "@/types";
import { CONFIDENCE_THRESHOLD } from "@/types";

export { normalizeLabel } from "@/lib/semantics";
export { categorizeField } from "@/lib/semantics";

function profileValue(
  profile: UserProfile,
  key: keyof UserProfile,
): string | null {
  const value = profile[key];
  if (value === undefined || value === "") return null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

/** Best-effort parse of "street, City ST 12345" style addresses. */
function parseUsAddress(address: string): {
  street: string;
  city?: string;
  state?: string;
  zip?: string;
} {
  const m = address
    .trim()
    .match(/^(.+),\s*([^,]+?)\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/);
  const street = m?.[1];
  const city = m?.[2];
  const state = m?.[3];
  const zip = m?.[4];
  if (!street || !city || !state || !zip) return { street: address.trim() };
  return {
    street: street.trim(),
    city: city.trim(),
    state: state.toUpperCase(),
    zip,
  };
}

function addressPart(
  profile: UserProfile,
  part: "street" | "city" | "state" | "zip",
): string | null {
  if (!profile.location) return null;
  const parsed = parseUsAddress(profile.location);
  return parsed[part] ?? null;
}

/**
 * Resolve a detected field to a profile value via canonical key / aliases.
 * Returns null when no confident local match exists (caller should ask backend).
 */
export function matchFieldToProfile(
  field: DetectedField,
  profile: UserProfile,
): string | null {
  // Prefer already-normalized canonical key
  if (field.canonicalKey) {
    if (field.canonicalKey === "address" || field.canonicalKey === "location") {
      return addressPart(profile, "street") ?? profileValue(profile, "location");
    }
    if (field.canonicalKey === "city") {
      return addressPart(profile, "city") ?? profileValue(profile, "location");
    }
    if (field.canonicalKey === "state") {
      return addressPart(profile, "state");
    }
    if (field.canonicalKey === "zip") {
      return addressPart(profile, "zip");
    }
    const profileKey = CANONICAL_TO_PROFILE[field.canonicalKey as keyof typeof CANONICAL_TO_PROFILE];
    if (profileKey) {
      const v = profileValue(profile, profileKey);
      if (v !== null) return v;
    }
    // full_name special case
    if (field.canonicalKey === "full_name") {
      const parts = [profile.firstName, profile.lastName].filter(Boolean);
      if (parts.length) return parts.join(" ");
    }
  }

  const match = inferCanonicalKey([
    field.label,
    field.placeholder,
    field.ariaLabel,
    field.ariaLabelledBy,
    field.nearbyText,
    field.name,
    field.id,
  ]);
  if (!match || match.confidence < 0.7) return null;

  if (match.key === "full_name") {
    const parts = [profile.firstName, profile.lastName].filter(Boolean);
    return parts.length ? parts.join(" ") : null;
  }
  if (match.key === "address" || match.key === "location") {
    return addressPart(profile, "street") ?? profileValue(profile, "location");
  }
  if (match.key === "city") {
    return addressPart(profile, "city") ?? profileValue(profile, "location");
  }
  if (match.key === "state") {
    return addressPart(profile, "state");
  }
  if (match.key === "zip") {
    return addressPart(profile, "zip");
  }

  const profileKey = CANONICAL_TO_PROFILE[match.key];
  if (!profileKey) return null;
  return profileValue(profile, profileKey);
}

/**
 * Merge backend autofill values with local profile matches.
 * Matching prefers canonicalKey, then label.
 */
export function resolveAutofillValues(
  fields: DetectedField[],
  profile: UserProfile | null,
  backendValues: AutofillValue[],
  threshold = CONFIDENCE_THRESHOLD,
): { fill: AutofillValue[]; review: AutofillValue[] } {
  const byCanonical = new Map(
    backendValues
      .filter((v) => v.canonicalKey)
      .map((v) => [v.canonicalKey!, v]),
  );
  const byLabel = new Map(
    backendValues.map((v) => [normalizeLabel(v.field), v]),
  );

  const fill: AutofillValue[] = [];
  const review: AutofillValue[] = [];

  for (const field of fields) {
    if (field.type === "file" || field.type === "button" || field.type === "hidden") {
      continue;
    }

    const backend =
      (field.canonicalKey && byCanonical.get(field.canonicalKey)) ||
      byLabel.get(normalizeLabel(field.label)) ||
      (field.canonicalKey
        ? byLabel.get(normalizeLabel(field.canonicalKey.replace(/_/g, " ")))
        : undefined);

    if (backend) {
      const target = {
        ...backend,
        field: field.label,
        canonicalKey: field.canonicalKey || backend.canonicalKey,
      };
      if (backend.needsReview || backend.confidence < threshold) {
        review.push(target);
      } else {
        fill.push(target);
      }
      continue;
    }

    if (profile) {
      const local = matchFieldToProfile(field, profile);
      if (local !== null) {
        fill.push({
          field: field.label,
          canonicalKey: field.canonicalKey,
          value: local,
          confidence: 1,
        });
      }
    }
  }

  return { fill, review };
}

function isFieldEmptyInDom(field: DetectedField): boolean {
  const el = findElement(field);
  if (!el) return true;
  if (el instanceof HTMLInputElement) {
    if (el.type === "checkbox" || el.type === "radio") {
      return !el.checked;
    }
    return !el.value?.trim();
  }
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    return !String(el.value || "").trim();
  }
  if (el.isContentEditable) {
    return !el.textContent?.trim();
  }
  return true;
}

/** Fields that are fillable candidates (not file/button/hidden). */
export function isFillableField(field: DetectedField): boolean {
  return (
    field.type !== "file" &&
    field.type !== "button" &&
    field.type !== "hidden"
  );
}

/**
 * Collect fields the rule-based pass did not confidently fill that are still
 * empty in the DOM — candidates for AI fallback.
 */
export function collectUnresolvedFields(
  fields: DetectedField[],
  filled: AutofillValue[],
): DetectedField[] {
  const filledLabels = new Set(filled.map((v) => normalizeLabel(v.field)));
  const filledKeys = new Set(
    filled.map((v) => v.canonicalKey).filter(Boolean) as string[],
  );

  return fields.filter((field) => {
    if (!isFillableField(field)) return false;
    if (field.canonicalKey && filledKeys.has(field.canonicalKey)) return false;
    if (filledLabels.has(normalizeLabel(field.label))) return false;
    return isFieldEmptyInDom(field);
  });
}

/** Serialize unresolved fields for POST /extension/autofill/ai. */
export function serializeUnresolvedFields(fields: DetectedField[]) {
  return fields.map((f) => ({
    uid: f.uid,
    selector: f.selector,
    label: f.label,
    placeholder: f.placeholder,
    name: f.name,
    id: f.id,
    type: f.type,
    required: Boolean(f.required),
    options: f.options ?? [],
    surrounding_text: f.nearbyText,
    nearbyText: f.nearbyText,
    section: f.parentSection,
    parentSection: f.parentSection,
    canonicalKey: f.canonicalKey,
  }));
}
