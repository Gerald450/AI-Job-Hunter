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
  | "at_least_18"
  | "years_experience"
  | "education"
  | "degree"
  | "field_of_study"
  | "graduation_date"
  | "gpa"
  | "preferred_location"
  | "gender"
  | "veteran"
  | "race"
  | "disability"
  | "hear_about_us"
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
  "legally eligible": "work_authorization",
  "legally eligible to work": "work_authorization",
  "eligible to work": "work_authorization",
  "work authorization": "work_authorization",
  "work eligibility": "work_authorization",
  sponsorship: "sponsorship",
  "require sponsorship": "sponsorship",
  "requires sponsorship": "sponsorship",
  "visa sponsorship": "sponsorship",
  "need sponsorship": "sponsorship",
  "employment visa": "sponsorship",
  "employment visa status": "sponsorship",
  "require sponsorship for employment visa status": "sponsorship",
  "will you now or in the future require sponsorship": "sponsorship",
  "at least 18": "at_least_18",
  "at least 18 years of age": "at_least_18",
  "18 years of age": "at_least_18",
  "are you at least 18": "at_least_18",
  "over 18": "at_least_18",
  "18 or older": "at_least_18",

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
  "degree type": "degree",
  "field of study": "field_of_study",
  "field of study / major": "field_of_study",
  major: "field_of_study",
  "area of study": "field_of_study",
  concentration: "field_of_study",
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

  // Referral / source
  "how did you hear about us": "hear_about_us",
  "how did you hear about this job": "hear_about_us",
  "how did you hear about this role": "hear_about_us",
  "how did you hear about this opportunity": "hear_about_us",
  "how did you find us": "hear_about_us",
  "how did you find this job": "hear_about_us",
  "where did you hear about us": "hear_about_us",
  "where did you hear about this job": "hear_about_us",
  "referral source": "hear_about_us",
  "source of hire": "hear_about_us",
  "application source": "hear_about_us",

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
  "desired hourly rate or annual salary": "salary",
  "hourly rate or annual salary": "salary",
  "hourly rate": "salary",
  "annual salary": "salary",
  "salary expectation": "salary",
  "salary expectations": "salary",
  compensation: "salary",
  "desired compensation": "salary",
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
  address: "location",
  preferred_location: "preferredLocation",
  work_authorization: "authorizedToWork",
  sponsorship: "requiresSponsorship",
  at_least_18: "atLeast18",
  years_experience: "yearsExperience",
  education: "education",
  degree: "degree",
  field_of_study: "fieldOfStudy",
  graduation_date: "graduationDate",
  gpa: "gpa",
  gender: "gender",
  veteran: "veteran",
  race: "race",
  disability: "disability",
  hear_about_us: "hearAboutUs",
  salary: "desiredSalary",
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
  { pattern: /authorized to work|legally authorized|legally eligible|work authorization|eligible to work|work eligibility/i, category: "work_auth" },
  { pattern: /sponsorship|visa|h-?1b|employment visa/i, category: "sponsorship" },
  { pattern: /at least 18|18 years of age|over 18|18 or older/i, category: "at_least_18" },
  { pattern: /salary|hourly rate|compensation|desired pay/i, category: "salary" },
  { pattern: /\bgender\b|\bsex\b/i, category: "gender" },
  { pattern: /veteran/i, category: "veteran" },
  { pattern: /\brace\b|ethnicity|hispanic|latino/i, category: "race" },
  { pattern: /disability|disabled/i, category: "disability" },
  { pattern: /how did you hear|where did you hear|referral source|application source/i, category: "hear_about_us" },
  { pattern: /years? of experience|how many years/i, category: "experience" },
  { pattern: /graduation|graduat/i, category: "graduation" },
  { pattern: /preferred location|where.*prefer/i, category: "preferred_location" },
  { pattern: /education|school|university|college/i, category: "education" },
  { pattern: /\bdegree\b|bachelor|master|phd/i, category: "degree" },
  { pattern: /field of study|\bmajor\b|area of study|concentration/i, category: "field_of_study" },
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
