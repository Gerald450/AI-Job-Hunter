/**
 * Shared contracts for the Playwright automation layer.
 *
 * Designed to stay extension-compatible and future-ready for:
 * AI element selection, LLM form reasoning, CAPTCHA pause, multi-tab sessions.
 */

import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* ATS                                                                        */
/* -------------------------------------------------------------------------- */

export const AtsPlatformSchema = z.enum([
  "workday",
  "greenhouse",
  "lever",
  "ashby",
  "smartrecruiters",
  "icims",
  "oracle",
  "taleo",
  "unknown",
]);
export type AtsPlatform = z.infer<typeof AtsPlatformSchema>;

/* -------------------------------------------------------------------------- */
/* Profile / fill payloads                                                    */
/* -------------------------------------------------------------------------- */

export const UserProfileSchema = z
  .object({
    firstName: z.string().optional(),
    middleName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    linkedin: z.string().optional(),
    website: z.string().optional(),
    location: z.string().optional(),
    authorizedToWork: z.boolean().optional(),
    requiresSponsorship: z.boolean().optional(),
    atLeast18: z.boolean().optional(),
    desiredSalary: z.string().optional(),
    yearsExperience: z.number().optional(),
    education: z.string().optional(),
    degree: z.string().optional(),
    fieldOfStudy: z.string().optional(),
    graduationDate: z.string().optional(),
    gpa: z.string().optional(),
    preferredLocation: z.string().optional(),
    gender: z.string().optional(),
    veteran: z.string().optional(),
    race: z.string().optional(),
    disability: z.string().optional(),
    hearAboutUs: z.string().optional(),
  })
  .passthrough();
export type UserProfile = z.infer<typeof UserProfileSchema>;

export const FieldTargetSchema = z.object({
  uid: z.string().optional(),
  selector: z.string().optional(),
  label: z.string().optional(),
  placeholder: z.string().optional(),
  name: z.string().optional(),
  id: z.string().optional(),
  role: z.string().optional(),
  text: z.string().optional(),
  type: z.string().optional(),
  canonicalKey: z.string().optional(),
  value: z.union([z.string(), z.boolean(), z.number()]).optional(),
});
export type FieldTarget = z.infer<typeof FieldTargetSchema>;

/* -------------------------------------------------------------------------- */
/* Request / response                                                         */
/* -------------------------------------------------------------------------- */

export const AutomationActionSchema = z.enum([
  "start",
  "continue",
  "fill",
  "upload",
  "click",
  "stop",
  "detect",
  "extract_questions",
  "click_next",
  "submit",
]);
export type AutomationAction = z.infer<typeof AutomationActionSchema>;

export const AutomationRequestSchema = z.object({
  /** Target page URL (required for start; optional when session already bound). */
  url: z.string().url().optional(),
  /** Optional page HTML snapshot from the extension (future AI selection). */
  html: z.string().optional(),
  /** Explicit selectors / field targets from the content script. */
  fields: z.array(FieldTargetSchema).optional(),
  /** High-level action when using the generic /automation/:action routes. */
  action: AutomationActionSchema.optional(),
  /** Profile used to fill forms. */
  profile: UserProfileSchema.optional(),
  /** Absolute path or file:// URL to resume on disk. */
  resumePath: z.string().optional(),
  /** Base64 resume payload when the extension cannot share a local path. */
  resumeBase64: z.string().optional(),
  resumeFilename: z.string().optional(),
  resumeMimeType: z.string().optional(),
  /** Optional CDP target tab id / page URL hint to reuse the current tab. */
  tabUrl: z.string().optional(),
  /** Force ATS platform instead of auto-detect. */
  ats: AtsPlatformSchema.optional(),
  /** Opaque session id for multi-step / parallel sessions (future). */
  sessionId: z.string().optional(),
  /** Click target for /automation/click */
  clickTarget: FieldTargetSchema.optional(),
  /** Extra free-form metadata for adapters / future LLM reasoning. */
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type AutomationRequest = z.infer<typeof AutomationRequestSchema>;

export interface AutomationLogEntry {
  ts: string;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  detail?: unknown;
}

export interface PageState {
  url: string;
  title: string;
  ats: AtsPlatform;
  step?: string;
}

export interface AutomationResult {
  success: boolean;
  error?: string;
  code?:
    | "CDP_UNAVAILABLE"
    | "NO_SESSION"
    | "ACTION_FAILED"
    | "CAPTCHA_DETECTED"
    | "VALIDATION"
    | "INTERNAL";
  logs: AutomationLogEntry[];
  pageState?: PageState;
  /** Suggested next high-level action for the extension UI. */
  nextAction?: AutomationAction | "done" | "manual_review" | "wait_user";
  /** Paths to failure artifacts when available. */
  artifacts?: {
    screenshot?: string;
    html?: string;
  };
  /** Adapter-specific payload (extracted questions, filled keys, etc.). */
  data?: Record<string, unknown>;
  sessionId?: string;
}

export interface ApplicationState {
  startedAt: string;
  lastActionAt: string;
  filledFields: string[];
  uploadedResume: boolean;
  stepHistory: string[];
  captchaPaused: boolean;
}
