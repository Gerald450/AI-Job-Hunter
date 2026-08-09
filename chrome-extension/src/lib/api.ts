/**
 * Typed Axios client for the AI Job Hunter backend extension endpoints.
 *
 * All network traffic from the content script should go through the background
 * worker (via BACKEND_REQUEST messages) so auth headers stay private. The
 * popup / options pages may call these helpers directly.
 */

import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";
import { z } from "zod";
import {
  AutofillResponseSchema,
  JobAnalysisResponseSchema,
  QuestionsResponseSchema,
  UserProfileSchema,
  type AutofillResponse,
  type DescriptionSource,
  type DetectedField,
  type ExtensionSettings,
  type JobAnalysisResponse,
  type JobExtraction,
  type QuestionsResponse,
  type UserProfile,
} from "@/types";
import { getSettings } from "@/lib/storage";
import { logger } from "@/lib/logger";

const SCOPE = "api";
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function createClient(settings: ExtensionSettings): AxiosInstance {
  const baseURL = settings.backendUrl.replace(/\/$/, "");
  const client = axios.create({
    baseURL,
    timeout: DEFAULT_TIMEOUT_MS,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(settings.apiKey ? { "X-API-Key": settings.apiKey } : {}),
      ...(settings.jwt ? { Authorization: `Bearer ${settings.jwt}` } : {}),
    },
  });
  return client;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      // Don't retry auth failures or client errors (except 408/429)
      if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
        break;
      }
      if (attempt < retries) {
        const delay = 400 * 2 ** attempt;
        logger.warn(SCOPE, `Retry ${attempt + 1}/${retries} after ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (axios.isAxiosError(err)) {
    if (!err.response) {
      return new ApiError("Backend unreachable", undefined, "NETWORK");
    }
    if (err.response.status === 401 || err.response.status === 403) {
      return new ApiError("Authentication expired", err.response.status, "AUTH");
    }
    const detail =
      typeof err.response.data === "object" &&
      err.response.data &&
      "detail" in err.response.data
        ? String((err.response.data as { detail: unknown }).detail)
        : err.message;
    return new ApiError(detail, err.response.status);
  }
  return new ApiError(err instanceof Error ? err.message : "Unknown API error");
}

function parse<T>(schema: z.ZodType<T>, data: unknown, label: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    logger.error(SCOPE, `Invalid ${label} response`, result.error);
    throw new ApiError(`Invalid ${label} response from backend`, undefined, "SCHEMA");
  }
  return result.data;
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

export async function checkHealth(settings?: ExtensionSettings): Promise<boolean> {
  const s = settings ?? (await getSettings());
  try {
    const client = createClient(s);
    const res = await client.get("/health", { timeout: 5_000 });
    return res.status === 200;
  } catch {
    return false;
  }
}

export async function fetchProfile(
  settings?: ExtensionSettings,
): Promise<UserProfile> {
  const s = settings ?? (await getSettings());
  try {
    const client = createClient(s);
    const res = await withRetry(() =>
      client.post("/extension/profile", { resumeId: s.resumeId }),
    );
    return parse(UserProfileSchema, res.data, "profile");
  } catch (err) {
    throw toApiError(err);
  }
}

export interface AutofillRequest {
  fields: DetectedField[];
  job?: Partial<JobExtraction>;
  profile?: UserProfile | null;
}

export interface AiAutofillRequest {
  resumeId?: string;
  fields: Array<{
    uid?: string;
    selector?: string;
    label: string;
    placeholder?: string;
    name?: string;
    id?: string;
    type?: string;
    required?: boolean;
    options?: string[];
    surrounding_text?: string;
    nearbyText?: string;
    section?: string;
    parentSection?: string;
    canonicalKey?: string;
  }>;
  profile?: UserProfile | null;
  job?: Partial<JobExtraction>;
  ats?: string;
}

export async function requestAutofill(
  body: AutofillRequest,
  settings?: ExtensionSettings,
): Promise<AutofillResponse> {
  const s = settings ?? (await getSettings());
  try {
    const client = createClient(s);
    const res = await withRetry(() => client.post("/extension/autofill", body));
    return parse(AutofillResponseSchema, res.data, "autofill");
  } catch (err) {
    throw toApiError(err);
  }
}

/** Opt-in Groq AI fallback for unresolved fields only. */
export async function requestAiAutofill(
  body: AiAutofillRequest,
  settings?: ExtensionSettings,
): Promise<AutofillResponse> {
  const s = settings ?? (await getSettings());
  if (!s.resumeId) {
    throw new ApiError(
      "No resume configured. Upload one and paste the resumeId in Options.",
      undefined,
      "NO_RESUME",
    );
  }
  try {
    const client = createClient(s);
    const res = await withRetry(() =>
      client.post(
        "/extension/autofill/ai",
        {
          ...body,
          resumeId: body.resumeId || s.resumeId,
        },
        { timeout: 60_000 },
      ),
    );
    return parse(AutofillResponseSchema, res.data, "ai autofill");
  } catch (err) {
    throw toApiError(err);
  }
}

export async function analyzeJob(
  job: JobExtraction,
  options?: {
    refresh?: boolean;
    settings?: ExtensionSettings;
    descriptionSource?: DescriptionSource;
    persistDescription?: boolean;
  },
): Promise<JobAnalysisResponse> {
  const s = options?.settings ?? (await getSettings());
  if (!s.resumeId) {
    throw new ApiError(
      "No resume configured. Upload one and paste the resumeId in Options.",
      undefined,
      "NO_RESUME",
    );
  }
  try {
    const client = createClient(s);
    const res = await withRetry(() =>
      client.post(
        "/extension/job",
        {
          ...job,
          resumeId: s.resumeId,
          refresh: options?.refresh ?? false,
          descriptionSource: options?.descriptionSource,
          persistDescription: options?.persistDescription,
        },
        { timeout: 60_000 },
      ),
    );
    return parse(JobAnalysisResponseSchema, res.data, "job analysis");
  } catch (err) {
    throw toApiError(err);
  }
}

export async function saveJobDescription(
  jobId: string,
  description: string,
  settings?: ExtensionSettings,
): Promise<void> {
  const s = settings ?? (await getSettings());
  try {
    const client = createClient(s);
    await withRetry(() =>
      client.post(`/extension/job/${jobId}/description`, { description }),
    );
  } catch (err) {
    throw toApiError(err);
  }
}

export async function answerQuestions(
  fields: DetectedField[],
  settings?: ExtensionSettings,
): Promise<QuestionsResponse> {
  const s = settings ?? (await getSettings());
  try {
    const client = createClient(s);
    const res = await withRetry(() =>
      client.post("/extension/questions", { fields }),
    );
    return parse(QuestionsResponseSchema, res.data, "questions");
  } catch (err) {
    throw toApiError(err);
  }
}

/**
 * Download the user's resume blob from the backend.
 * Returns a File ready to attach to `<input type="file">`.
 */
export async function downloadResume(
  settings?: ExtensionSettings,
): Promise<File> {
  const s = settings ?? (await getSettings());
  if (!s.resumeId) {
    throw new ApiError("No resume configured", undefined, "NO_RESUME");
  }
  try {
    const client = createClient(s);
    const res = await withRetry(() =>
      client.post(
        "/extension/upload",
        { resumeId: s.resumeId },
        { responseType: "blob" } satisfies AxiosRequestConfig,
      ),
    );
    const contentType =
      (res.headers["content-type"] as string | undefined) ?? "application/pdf";
    const filename = s.resumeFilename || "resume.pdf";
    return new File([res.data as Blob], filename, { type: contentType });
  } catch (err) {
    throw toApiError(err);
  }
}

/** Generic authenticated request used by the background worker. */
export async function backendRequest<T = unknown>(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  data?: unknown,
  settings?: ExtensionSettings,
): Promise<T> {
  const s = settings ?? (await getSettings());
  try {
    const client = createClient(s);
    const res = await withRetry(() =>
      client.request({ method, url: path, data }),
    );
    return res.data as T;
  } catch (err) {
    throw toApiError(err);
  }
}
