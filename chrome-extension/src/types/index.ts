/**
 * Shared types and Zod schemas for the AI Job Hunter Chrome extension.
 *
 * Keep all cross-module contracts here so content scripts, the background
 * worker, and React surfaces share a single source of truth.
 */

import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* ATS                                                                        */
/* -------------------------------------------------------------------------- */

/** Known ATS platforms. Unknown / custom portals use "unknown" + generic engine. */
export const AtsProviderSchema = z.enum([
  "greenhouse",
  "lever",
  "ashby",
  "workable",
  "workday",
  "smartrecruiters",
  "icims",
  "oracle",
  "taleo",
  "successfactors",
  "jobvite",
  "teamtailor",
  "bamboohr",
  "recruitee",
  "lifeattiktok",
  "unknown",
]);
export type AtsProvider = z.infer<typeof AtsProviderSchema>;

/* -------------------------------------------------------------------------- */
/* Form fields                                                                */
/* -------------------------------------------------------------------------- */

export const FieldTypeSchema = z.enum([
  "text",
  "email",
  "tel",
  "url",
  "number",
  "date",
  "password",
  "textarea",
  "select",
  "checkbox",
  "radio",
  "file",
  "combobox",
  "contenteditable",
  "button",
  "hidden",
  "unknown",
]);
export type FieldType = z.infer<typeof FieldTypeSchema>;

export const FieldOptionSchema = z.object({
  label: z.string(),
  value: z.string(),
});
export type FieldOption = z.infer<typeof FieldOptionSchema>;

/**
 * Normalized field schema produced by the generic detection engine.
 * ATS adapters may enrich these fields but must not invent a parallel schema.
 */
export const DetectedFieldSchema = z.object({
  /** Stable DOM fingerprint used to re-locate the element after round-trips. */
  uid: z.string(),
  /** Best human-readable label resolved from DOM semantics. */
  label: z.string(),
  /**
   * Canonical semantic key (e.g. "first_name", "phone", "resume").
   * Set by the normalization layer — never by brittle CSS selectors.
   */
  canonicalKey: z.string().optional(),
  name: z.string().optional(),
  id: z.string().optional(),
  placeholder: z.string().optional(),
  ariaLabel: z.string().optional(),
  ariaLabelledBy: z.string().optional(),
  ariaDescribedBy: z.string().optional(),
  role: z.string().optional(),
  type: FieldTypeSchema,
  required: z.boolean(),
  options: z.array(FieldOptionSchema).optional(),
  currentValue: z.string().optional(),
  /** Nearest section / fieldset / heading context. */
  parentSection: z.string().optional(),
  /** Instructional / help text near the control. */
  nearbyText: z.string().optional(),
  /** Visible validation / error message if present. */
  validationMessage: z.string().optional(),
  cssClasses: z.string().optional(),
  /** Heuristic category used for screening-question routing. */
  category: z.string().optional(),
  /** Best-effort CSS selector for re-query (hint only — never primary identity). */
  selector: z.string().optional(),
  /** Extra adapter-provided metadata (Workday step, etc.). */
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type DetectedField = z.infer<typeof DetectedFieldSchema>;

/* -------------------------------------------------------------------------- */
/* Job extraction                                                             */
/* -------------------------------------------------------------------------- */

export const JobExtractionSchema = z.object({
  title: z.string().optional(),
  company: z.string().optional(),
  location: z.string().optional(),
  salary: z.string().optional(),
  description: z.string().optional(),
  requirements: z.string().optional(),
  responsibilities: z.string().optional(),
  employmentType: z.string().optional(),
  remote: z.boolean().optional(),
  url: z.string().url().or(z.string()),
  ats: AtsProviderSchema,
});
export type JobExtraction = z.infer<typeof JobExtractionSchema>;

export const DescriptionSourceSchema = z.enum([
  "dom",
  "manual_selection",
  "clipboard",
  "fetched",
]);
export type DescriptionSource = z.infer<typeof DescriptionSourceSchema>;

export interface AnalyzeJobPayload {
  job: JobExtraction;
  refresh?: boolean;
  descriptionSource?: DescriptionSource;
  persistDescription?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Autofill                                                                   */
/* -------------------------------------------------------------------------- */

export const AutofillValueSchema = z.object({
  /** Label or canonicalKey the backend intends to fill. */
  field: z.string(),
  /** Prefer matching by canonical key when present. */
  canonicalKey: z.string().optional(),
  value: z.union([z.string(), z.boolean(), z.number()]),
  confidence: z.number().min(0).max(1).default(1),
  /** When true, highlight for manual review instead of filling. */
  needsReview: z.boolean().optional(),
  uid: z.string().optional(),
  selector: z.string().optional(),
  explanation: z.string().optional(),
});
export type AutofillValue = z.infer<typeof AutofillValueSchema>;

export const AutofillResponseSchema = z.object({
  values: z.array(AutofillValueSchema),
  resumeUrl: z.string().url().optional(),
  resumeFilename: z.string().optional(),
});
export type AutofillResponse = z.infer<typeof AutofillResponseSchema>;

export const AiAutofillFieldPayloadSchema = z.object({
  uid: z.string().optional(),
  selector: z.string().optional(),
  label: z.string(),
  placeholder: z.string().optional(),
  name: z.string().optional(),
  id: z.string().optional(),
  type: z.string().optional(),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  surrounding_text: z.string().optional(),
  nearbyText: z.string().optional(),
  section: z.string().optional(),
  parentSection: z.string().optional(),
  canonicalKey: z.string().optional(),
});
export type AiAutofillFieldPayload = z.infer<typeof AiAutofillFieldPayloadSchema>;

export const QuestionAnswerSchema = z.object({
  question: z.string(),
  answer: z.union([z.string(), z.boolean(), z.number()]),
  confidence: z.number().min(0).max(1),
  category: z.string().optional(),
  canonicalKey: z.string().optional(),
});
export type QuestionAnswer = z.infer<typeof QuestionAnswerSchema>;

export const QuestionsResponseSchema = z.object({
  answers: z.array(QuestionAnswerSchema),
});
export type QuestionsResponse = z.infer<typeof QuestionsResponseSchema>;

export const JobAnalysisResponseSchema = z.object({
  id: z.string().optional(),
  jobId: z.string().optional(),
  resumeId: z.string().optional(),
  company: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  /** Backend AnalysisResponse field. */
  overall_match: z.number().min(0).max(100).optional(),
  /** Legacy extension field — mapped from overall_match when absent. */
  score: z.number().min(0).max(100).optional(),
  summary: z.string().optional(),
  strengths: z.array(z.string()).optional(),
  missing_skills: z.array(z.string()).optional(),
  recommended_improvements: z.array(z.string()).optional(),
  matched_keywords: z.array(z.string()).optional(),
  missing_keywords: z.array(z.string()).optional(),
  confidence: z.string().optional(),
  llm_provider: z.string().optional(),
  cached: z.boolean().optional(),
  created_at: z.string().nullable().optional(),
  /** Legacy alias for missing_skills. */
  gaps: z.array(z.string()).optional(),
  canSaveDescription: z.boolean().optional(),
  descriptionPersisted: z.boolean().optional(),
}).transform((raw) => {
  const overall =
    raw.overall_match ??
    raw.score ??
    0;
  const missing =
    raw.missing_skills ??
    raw.gaps ??
    [];
  return {
    ...raw,
    overall_match: overall,
    score: overall,
    missing_skills: missing,
    gaps: missing,
    strengths: raw.strengths ?? [],
    recommended_improvements: raw.recommended_improvements ?? [],
    summary: raw.summary ?? "",
    canSaveDescription: Boolean(raw.canSaveDescription),
    descriptionPersisted: Boolean(raw.descriptionPersisted),
  };
});
export type JobAnalysisResponse = z.infer<typeof JobAnalysisResponseSchema>;

/* -------------------------------------------------------------------------- */
/* User profile / settings                                                    */
/* -------------------------------------------------------------------------- */

export const UserProfileSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  linkedin: z.string().optional(),
  website: z.string().optional(),
  location: z.string().optional(),
  authorizedToWork: z.boolean().optional(),
  requiresSponsorship: z.boolean().optional(),
  yearsExperience: z.number().optional(),
  education: z.string().optional(),
  degree: z.string().optional(),
  graduationDate: z.string().optional(),
  gpa: z.string().optional(),
  preferredLocation: z.string().optional(),
  gender: z.string().optional(),
  veteran: z.string().optional(),
  race: z.string().optional(),
  disability: z.string().optional(),
  hearAboutUs: z.string().optional(),
  fieldOfStudy: z.string().optional(),
  atLeast18: z.boolean().optional(),
  desiredSalary: z.string().optional(),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

/** Personal defaults applied when a stored profile omits these keys. */
export const DEFAULT_PROFILE_VALUES: Partial<UserProfile> = {
  gender: "Male",
  race: "Black or African American",
  disability: "No",
  veteran: "I'm not a protected veteran, or I'm not a veteran",
  location: "1200 N University Dr, Pine Bluff Ar 71601",
  hearAboutUs: "LinkedIn",
  degree: "Bachelors",
  fieldOfStudy: "Computer Science",
  authorizedToWork: true,
  requiresSponsorship: true,
  atLeast18: true,
  desiredSalary: "100000",
};

export const ExtensionSettingsSchema = z.object({
  backendUrl: z.string().default("http://localhost:8000"),
  /** Local Playwright automation API (fallback only — never primary). */
  automationUrl: z.string().default("http://localhost:8090"),
  apiKey: z.string().default(""),
  jwt: z.string().default(""),
  resumeId: z.string().default(""),
  resumeFilename: z.string().default(""),
  autoFillEnabled: z.boolean().default(true),
  autoUploadResume: z.boolean().default(true),
  autoAnswerQuestions: z.boolean().default(true),
  /**
   * When true, unresolved fields / failed uploads may call the Playwright
   * backend after the content-script autofill pass. Never used first.
   */
  playwrightFallbackEnabled: z.boolean().default(true),
  darkMode: z.boolean().default(false),
  debugLogging: z.boolean().default(false),
  dashboardUrl: z.string().default("http://localhost:3000"),
  confidenceThreshold: z.number().min(0).max(1).default(0.9),
});
export type ExtensionSettings = z.infer<typeof ExtensionSettingsSchema>;

export const DEFAULT_SETTINGS: ExtensionSettings = ExtensionSettingsSchema.parse({});

export const RecentApplicationSchema = z.object({
  url: z.string(),
  title: z.string().optional(),
  company: z.string().optional(),
  ats: AtsProviderSchema,
  appliedAt: z.string(),
  status: z.enum(["filled", "submitted", "failed", "partial"]),
});
export type RecentApplication = z.infer<typeof RecentApplicationSchema>;

/* -------------------------------------------------------------------------- */
/* Messaging                                                                  */
/* -------------------------------------------------------------------------- */

export const MessageTypeSchema = z.enum([
  "PING",
  "GET_SETTINGS",
  "UPDATE_SETTINGS",
  "GET_PROFILE",
  "UPDATE_PROFILE",
  "AUTOFILL_PAGE",
  "ANALYZE_JOB",
  "ANALYZE_SELECTION",
  "ANALYZE_CLIPBOARD",
  "GET_PAGE_SELECTION",
  "DETECT_FIELDS",
  "FIELDS_DETECTED",
  "UPLOAD_RESUME",
  "SHOW_TOAST",
  "GET_STATUS",
  "OPEN_TAB",
  "LOG",
  "BACKEND_REQUEST",
  "AUTOMATION_REQUEST",
]);
export type MessageType = z.infer<typeof MessageTypeSchema>;

export interface ExtensionMessage<T = unknown> {
  type: MessageType;
  payload?: T;
  requestId?: string;
}

export interface ExtensionResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface ExtensionStatus {
  connected: boolean;
  backendOnline: boolean;
  loggedIn: boolean;
  userEmail?: string;
  resumeLoaded: boolean;
  resumeFilename?: string;
  ats?: AtsProvider;
  autoFillEnabled: boolean;
}

export interface ToastPayload {
  kind: "success" | "error" | "info" | "warning";
  title: string;
  message?: string;
}

/** Minimum confidence required before silently autofilling AI-matched fields. */
export const CONFIDENCE_THRESHOLD = 0.9;
