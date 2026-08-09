/**
 * Client for the local Playwright automation backend (fallback only).
 *
 * Never call these helpers until the content-script autofill engine has already
 * attempted the action. The user-facing UX should stay identical either way.
 */

import axios, { type AxiosInstance } from "axios";
import { z } from "zod";
import type { ExtensionSettings, UserProfile } from "@/types";
import { getSettings } from "@/lib/storage";
import { logger } from "@/lib/logger";
import { ApiError } from "@/lib/api";

const SCOPE = "automation-api";
const DEFAULT_TIMEOUT_MS = 60_000;

export const AutomationLogSchema = z.object({
  ts: z.string(),
  level: z.enum(["debug", "info", "warn", "error"]),
  message: z.string(),
  detail: z.unknown().optional(),
});

export const AutomationResultSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  code: z
    .enum([
      "CDP_UNAVAILABLE",
      "NO_SESSION",
      "ACTION_FAILED",
      "CAPTCHA_DETECTED",
      "VALIDATION",
      "INTERNAL",
    ])
    .optional(),
  logs: z.array(AutomationLogSchema).default([]),
  pageState: z
    .object({
      url: z.string(),
      title: z.string(),
      ats: z.string(),
      step: z.string().optional(),
    })
    .optional(),
  nextAction: z.string().optional(),
  artifacts: z
    .object({
      screenshot: z.string().optional(),
      html: z.string().optional(),
    })
    .optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  sessionId: z.string().optional(),
});
export type AutomationResult = z.infer<typeof AutomationResultSchema>;

export interface AutomationFieldTarget {
  uid?: string;
  selector?: string;
  label?: string;
  placeholder?: string;
  name?: string;
  id?: string;
  role?: string;
  text?: string;
  type?: string;
  canonicalKey?: string;
  value?: string | boolean | number;
}

export interface AutomationFallbackRequest {
  url?: string;
  tabUrl?: string;
  html?: string;
  fields?: AutomationFieldTarget[];
  profile?: UserProfile | null;
  resumeBase64?: string;
  resumeFilename?: string;
  resumeMimeType?: string;
  ats?: string;
  sessionId?: string;
  meta?: Record<string, unknown>;
}

function createClient(settings: ExtensionSettings): AxiosInstance {
  const baseURL = (settings.automationUrl || "http://localhost:8090").replace(
    /\/$/,
    "",
  );
  return axios.create({
    baseURL,
    timeout: DEFAULT_TIMEOUT_MS,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });
}

function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (axios.isAxiosError(err)) {
    if (!err.response) {
      return new ApiError(
        "Playwright automation backend unreachable. Start automation-backend (port 8090).",
        undefined,
        "NETWORK",
      );
    }
    const data = err.response.data as AutomationResult | undefined;
    if (data?.error) {
      return new ApiError(data.error, err.response.status, data.code);
    }
    return new ApiError(err.message, err.response.status);
  }
  return new ApiError(err instanceof Error ? err.message : "Automation error");
}

export async function checkAutomationHealth(
  settings?: ExtensionSettings,
): Promise<{ ok: boolean; cdp?: boolean; cdpError?: string }> {
  const s = settings ?? (await getSettings());
  try {
    const client = createClient(s);
    const res = await client.get("/automation/health", { timeout: 5_000 });
    return {
      ok: Boolean(res.data?.ok),
      cdp: Boolean(res.data?.cdp),
      cdpError: res.data?.cdpError as string | undefined,
    };
  } catch {
    return { ok: false };
  }
}

export async function requestAutomationFallback(
  body: AutomationFallbackRequest,
  settings?: ExtensionSettings,
): Promise<AutomationResult> {
  const s = settings ?? (await getSettings());
  try {
    const client = createClient(s);
    logger.info(SCOPE, "Calling Playwright fallback", {
      url: body.url,
      fields: body.fields?.length ?? 0,
    });
    const res = await client.post("/automation/fallback", body, {
      timeout: 90_000,
    });
    const parsed = AutomationResultSchema.safeParse(res.data);
    if (!parsed.success) {
      throw new ApiError("Invalid automation response", undefined, "SCHEMA");
    }
    return parsed.data;
  } catch (err) {
    // Prefer structured body on 4xx/5xx when present
    if (axios.isAxiosError(err) && err.response?.data) {
      const parsed = AutomationResultSchema.safeParse(err.response.data);
      if (parsed.success) return parsed.data;
    }
    throw toApiError(err);
  }
}

export async function requestAutomationAction(
  action:
    | "start"
    | "continue"
    | "fill"
    | "upload"
    | "click"
    | "stop"
    | "submit"
    | "click_next",
  body: AutomationFallbackRequest & {
    clickTarget?: AutomationFieldTarget;
  },
  settings?: ExtensionSettings,
): Promise<AutomationResult> {
  const s = settings ?? (await getSettings());
  try {
    const client = createClient(s);
    const res = await client.post(`/automation/${action}`, body, {
      timeout: 90_000,
    });
    const parsed = AutomationResultSchema.safeParse(res.data);
    if (!parsed.success) {
      throw new ApiError("Invalid automation response", undefined, "SCHEMA");
    }
    return parsed.data;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.data) {
      const parsed = AutomationResultSchema.safeParse(err.response.data);
      if (parsed.success) return parsed.data;
    }
    throw toApiError(err);
  }
}

/** Human-readable guidance for CDP / automation failures. */
export function formatAutomationError(result: AutomationResult): string {
  if (result.code === "CDP_UNAVAILABLE") {
    return (
      result.error ||
      "Chrome remote debugging is not enabled. Start Chrome with --remote-debugging-port=9222."
    );
  }
  if (result.code === "CAPTCHA_DETECTED") {
    return (
      result.error ||
      "A CAPTCHA appeared. Solve it in the browser, then try Continue / Auto Fill again."
    );
  }
  return result.error || "Playwright automation failed";
}
