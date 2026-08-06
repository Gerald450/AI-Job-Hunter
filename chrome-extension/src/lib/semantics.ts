/**
 * Configurable semantic field mapping.
 *
 * Maps noisy visible labels / placeholders / ARIA text onto canonical keys
 * (first_name, phone, education, resume, …). Extend CANONICAL_ALIASES to
 * teach the engine new synonyms without touching the detector or autofill.
 */

import type { UserProfile } from "@/types";

/** Canonical semantic keys used across detection → backend → autofill. */
export type CanonicalKey =
  | "first_name"
  | "last_name"
  | "full_name"
  | "email"
  | "phone"
  | "linkedin"
  | "website"
  | "location"
  | "city"
  | "state"
  | "country"
  | "zip"
  | "address"
  | "work_authorization"
  | "sponsorship"
  | "years_experience"
  | "education"
  | "degree"
  | "graduation_date"
  | "gpa"
  | "preferred_location"
  | "gender"
  | "veteran"
  | "race"
  | "disability"
  | "resume"
  | "cover_letter"
  | "salary"
  | "start_date"
  | "linkedin_url"
  | "github"
  | "portfolio";

/**
 * Alias → canonical key registry.
 * Keys are lowercase normalized phrases. Longer / more specific aliases
 * should be listed so substring matching prefers them when scored.
 */
export const CANONICAL_ALIASES: Record<string, CanonicalKey> = {
  // First name
  "first name": "first_name",
  firstname: "first_name",
  "given name": "first_name",
  "legal first name": "first_name",
  "preferred first name": "first_name",
  "preferred name": "first_name",
  fname: "first_name",

  // Last name
  "last name": "last_name",
  lastname: "last_name",
  surname: "last_name",
  "family name": "last_name",
  "legal last name": "last_name",
  lname: "last_name",

  // Full name
  "full name": "full_name",
  "your name": "full_name",
  "legal name": "full_name",
  name: "full_name",

  // Email
  email: "email",
  "email address": "email",
  "e-mail": "email",
  "e mail": "email",
  "work email": "email",

  // Phone
  phone: "phone",
  telephone: "phone",
  mobile: "phone",
  "mobile phone": "phone",
  "mobile number": "phone",
  "phone number": "phone",
  "cell phone": "phone",
  "contact number": "phone",
  "primary phone": "phone",
  "home phone": "phone",
  tel: "phone",

  // Links
  linkedin: "linkedin",
  "linkedin url": "linkedin",
  "linkedin profile": "linkedin",
  "linkedin profile url": "linkedin_url",
  website: "website",
  "personal website": "website",
  "personal url": "website",
  portfolio: "portfolio",
  github: "github",
  "github url": "github",

  // Location
  location: "location",
  "current location": "location",
  city: "city",
  state: "state",
  "state / province": "state",
  country: "country",
  zip: "zip",
  "zip code": "zip",
  "postal code": "zip",
  address: "address",
  "street address": "address",
  "preferred location": "preferred_location",

  // Work auth
  "authorized to work": "work_authorization",
  "legally authorized": "work_authorization",
  "work authorization": "work_authorization",
  "eligible to work": "work_authorization",
  sponsorship: "sponsorship",
  "require sponsorship": "sponsorship",
  "requires sponsorship": "sponsorship",
  "visa sponsorship": "sponsorship",
  "need sponsorship": "sponsorship",

  // Experience / education
  "years of experience": "years_experience",
  "years experience": "years_experience",
  experience: "years_experience",
  education: "education",
  school: "education",
  university: "education",
  college: "education",
  "school name": "education",
  "university name": "education",
  degree: "degree",
  "highest degree": "degree",
  "graduation date": "graduation_date",
  "grad date": "graduation_date",
  "date of graduation": "graduation_date",
  gpa: "gpa",
  "grade point average": "gpa",

  // Demographics
  gender: "gender",
  sex: "gender",
  veteran: "veteran",
  "veteran status": "veteran",
  race: "race",
  ethnicity: "race",
  "race / ethnicity": "race",
  disability: "disability",
  "disability status": "disability",

  // Files
  resume: "resume",
  cv: "resume",
  "upload resume": "resume",
  "upload cv": "resume",
  "attach resume": "resume",
  "resume / cv": "resume",
  "curriculum vitae": "resume",
  "cover letter": "cover_letter",
  "coverletter": "cover_letter",

  // Misc
  salary: "salary",
  "desired salary": "salary",
  "expected salary": "salary",
  "start date": "start_date",
  "available start date": "start_date",
};

/** Map canonical keys → UserProfile properties for local autofill. */
export const CANONICAL_TO_PROFILE: Partial<
  Record<CanonicalKey, keyof UserProfile>
> = {
  first_name: "firstName",
  last_name: "lastName",
  email: "email",
  phone: "phone",
  linkedin: "linkedin",
  linkedin_url: "linkedin",
  website: "website",
  portfolio: "website",
  location: "location",
  city: "location",
  preferred_location: "preferredLocation",
  work_authorization: "authorizedToWork",
  sponsorship: "requiresSponsorship",
  years_experience: "yearsExperience",
  education: "education",
  degree: "degree",
  graduation_date: "graduationDate",
  gpa: "gpa",
  gender: "gender",
  veteran: "veteran",
  race: "race",
  disability: "disability",
};

/** Collapse whitespace / punctuation for fuzzy comparisons. */
export function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[*：:？?()[\]{}]/g, " ")
    .replace(/[_./\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface CanonicalMatch {
  key: CanonicalKey;
  /** 0–1 confidence of the alias match. */
  confidence: number;
  matchedAlias: string;
}

/**
 * Infer a canonical key from one or more text signals (label, placeholder,
 * aria, nearby text, name, id). Never relies on CSS class names alone.
 */
export function inferCanonicalKey(
  signals: Array<string | undefined | null>,
): CanonicalMatch | null {
  const cleaned = signals
    .filter((s): s is string => Boolean(s && s.trim()))
    .map(normalizeLabel);

  if (cleaned.length === 0) return null;

  let best: CanonicalMatch | null = null;

  for (const text of cleaned) {
    // Exact alias hit — highest confidence
    const exact = CANONICAL_ALIASES[text];
    if (exact) {
      const hit: CanonicalMatch = { key: exact, confidence: 1, matchedAlias: text };
      if (!best || hit.confidence > best.confidence) best = hit;
      continue;
    }

    // Substring / contains — prefer longer aliases
    const aliases = Object.entries(CANONICAL_ALIASES).sort(
      (a, b) => b[0].length - a[0].length,
    );
    for (const [alias, key] of aliases) {
      if (text.includes(alias)) {
        // Longer alias relative to text → higher confidence
        const ratio = alias.length / Math.max(text.length, 1);
        const confidence = Math.min(0.98, 0.7 + ratio * 0.25);
        if (!best || confidence > best.confidence) {
          best = { key, confidence, matchedAlias: alias };
        }
        break;
      }
    }
  }

  return best;
}

/** Register additional aliases at runtime (options page / experiments). */
export function registerAlias(alias: string, key: CanonicalKey): void {
  CANONICAL_ALIASES[normalizeLabel(alias)] = key;
}

/** Screening-question patterns → category tags. */
const SCREENING_PATTERNS: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /authorized to work|legally authorized|work authorization|eligible to work/i, category: "work_auth" },
  { pattern: /sponsorship|visa|h-?1b/i, category: "sponsorship" },
  { pattern: /\bgender\b|\bsex\b/i, category: "gender" },
  { pattern: /veteran/i, category: "veteran" },
  { pattern: /\brace\b|ethnicity|hispanic|latino/i, category: "race" },
  { pattern: /disability|disabled/i, category: "disability" },
  { pattern: /years? of experience|how many years/i, category: "experience" },
  { pattern: /graduation|graduat/i, category: "graduation" },
  { pattern: /preferred location|where.*prefer/i, category: "preferred_location" },
  { pattern: /education|school|university|college/i, category: "education" },
  { pattern: /\bdegree\b|bachelor|master|phd/i, category: "degree" },
  { pattern: /\bgpa\b|grade point/i, category: "gpa" },
  { pattern: /resume|curriculum vitae|\bcv\b/i, category: "resume" },
];

export function categorizeField(...signals: Array<string | undefined>): string | undefined {
  const hay = signals.filter(Boolean).join(" ");
  for (const { pattern, category } of SCREENING_PATTERNS) {
    if (pattern.test(hay)) return category;
  }
  return undefined;
}
