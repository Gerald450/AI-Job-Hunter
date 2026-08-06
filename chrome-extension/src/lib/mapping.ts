/**
 * Field-label mapping utilities.
 *
 * Uses the configurable semantic alias registry (lib/semantics) so profile
 * keys and backend responses match detected fields by meaning, not by ID.
 */

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
