/**
 * ATS adapter contract for Playwright fallback automation.
 *
 * New ATS platforms should implement this interface and register in index.ts
 * without modifying core browser/session logic.
 */

import type { Page } from "playwright";
import type { AutomationLogger } from "../logger.js";
import type {
  AtsPlatform,
  FieldTarget,
  UserProfile,
} from "../types.js";

export interface AdapterContext {
  page: Page;
  logger: AutomationLogger;
  profile?: UserProfile;
  fields?: FieldTarget[];
  resumePath?: string;
  resumeBase64?: string;
  resumeFilename?: string;
  resumeMimeType?: string;
}

export interface ExtractedQuestion {
  label: string;
  type?: string;
  required?: boolean;
  options?: string[];
  selector?: string;
}

export interface AtsAdapter {
  readonly id: AtsPlatform;

  /** Hostname / URL heuristics. */
  matches(url: string): boolean;

  fill(ctx: AdapterContext): Promise<{ filled: string[] }>;
  clickNext(ctx: AdapterContext): Promise<void>;
  submit(ctx: AdapterContext): Promise<void>;
  uploadResume(ctx: AdapterContext): Promise<void>;
  extractQuestions(ctx: AdapterContext): Promise<ExtractedQuestion[]>;
}

/** Common profile → canonical field map used by adapters. */
export const PROFILE_FIELD_MAP: Array<{
  keys: string[];
  get: (p: UserProfile) => string | number | boolean | undefined;
}> = [
  { keys: ["first_name", "firstName", "firstname"], get: (p) => p.firstName },
  { keys: ["last_name", "lastName", "lastname"], get: (p) => p.lastName },
  { keys: ["email", "email_address"], get: (p) => p.email },
  { keys: ["phone", "phone_number", "mobile"], get: (p) => p.phone },
  { keys: ["linkedin", "linkedin_url"], get: (p) => p.linkedin },
  { keys: ["website", "portfolio", "personal_website"], get: (p) => p.website },
  { keys: ["location", "city", "address", "street_address", "street"], get: (p) => p.location },
  { keys: ["education", "school", "university"], get: (p) => p.education },
  { keys: ["degree"], get: (p) => p.degree },
  {
    keys: ["field_of_study", "fieldOfStudy", "major", "area_of_study"],
    get: (p) => p.fieldOfStudy,
  },
  { keys: ["gpa"], get: (p) => p.gpa },
  {
    keys: ["years_experience", "experience_years"],
    get: (p) => p.yearsExperience,
  },
  {
    keys: ["authorized_to_work", "work_authorization"],
    get: (p) => p.authorizedToWork,
  },
  {
    keys: ["requires_sponsorship", "sponsorship", "visa_sponsorship"],
    get: (p) => p.requiresSponsorship,
  },
  {
    keys: ["at_least_18", "atLeast18", "over_18", "age_18"],
    get: (p) => p.atLeast18,
  },
  {
    keys: [
      "salary",
      "desired_salary",
      "desiredSalary",
      "expected_salary",
      "salary_expectation",
      "compensation",
    ],
    get: (p) => p.desiredSalary,
  },
  { keys: ["gender", "sex"], get: (p) => p.gender },
  { keys: ["race", "ethnicity", "race_ethnicity"], get: (p) => p.race },
  { keys: ["veteran", "veteran_status"], get: (p) => p.veteran },
  { keys: ["disability", "disability_status"], get: (p) => p.disability },
  {
    keys: [
      "hear_about_us",
      "hearAboutUs",
      "how_did_you_hear",
      "referral_source",
      "application_source",
    ],
    get: (p) => p.hearAboutUs,
  },
];
