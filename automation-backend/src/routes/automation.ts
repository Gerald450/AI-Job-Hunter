/**
 * REST routes consumed by the Chrome extension fallback layer.
 *
 * POST /automation/start
 * POST /automation/continue
 * POST /automation/fill
 * POST /automation/upload
 * POST /automation/click
 * POST /automation/stop
 * (+ detect, submit, extract_questions, fallback)
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { browserManager, cdpHelpMessage, cdpUrl } from "../automation/browserManager.js";
import { runAutomationAction, runFallbackFill } from "../automation/playwright.js";
import { sessionManager } from "../automation/sessionManager.js";
import {
  AutomationActionSchema,
  AutomationRequestSchema,
  type AutomationAction,
  type AutomationResult,
} from "../automation/types.js";

export const automationRouter = Router();

function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

function sendResult(res: Response, result: AutomationResult): void {
  const status = result.success
    ? 200
    : result.code === "CDP_UNAVAILABLE"
      ? 503
      : result.code === "VALIDATION"
        ? 400
        : result.code === "CAPTCHA_DETECTED"
          ? 409
          : 500;
  res.status(status).json(result);
}

async function handleAction(
  action: AutomationAction,
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = AutomationRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    sendResult(res, {
      success: false,
      error: parsed.error.message,
      code: "VALIDATION",
      logs: [],
    });
    return;
  }
  const result = await runAutomationAction(action, parsed.data);
  sendResult(res, result);
}

const ACTIONS: AutomationAction[] = [
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
];

for (const action of ACTIONS) {
  automationRouter.post(
    `/${action}`,
    asyncHandler(async (req, res) => {
      await handleAction(action, req, res);
    }),
  );
}

/** One-shot fallback used by the extension after local autofill gaps. */
automationRouter.post(
  "/fallback",
  asyncHandler(async (req, res) => {
    const parsed = AutomationRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendResult(res, {
        success: false,
        error: parsed.error.message,
        code: "VALIDATION",
        logs: [],
      });
      return;
    }
    const result = await runFallbackFill(parsed.data);
    sendResult(res, result);
  }),
);

/** Health + CDP readiness for the extension status panel. */
automationRouter.get(
  "/health",
  asyncHandler(async (_req, res) => {
    let cdp = false;
    let cdpError: string | undefined;
    try {
      await browserManager.connect();
      cdp = browserManager.isConnected();
    } catch (err) {
      cdpError = err instanceof Error ? err.message : String(err);
    }

    res.json({
      ok: true,
      service: "automation",
      cdp,
      cdpUrl: cdpUrl(),
      cdpError: cdp ? undefined : cdpError ?? cdpHelpMessage(cdpUrl()),
      sessions: sessionManager.list().map((s) => ({
        id: s.id,
        url: s.currentUrl,
        ats: s.ats,
        captchaPaused: s.application.captchaPaused,
      })),
    });
  }),
);

/** Generic action dispatcher — body.action required. */
automationRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const bodySchema = AutomationRequestSchema.extend({
      action: AutomationActionSchema,
    });
    const parsed = bodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendResult(res, {
        success: false,
        error: parsed.error.message,
        code: "VALIDATION",
        logs: [],
      });
      return;
    }
    const { action, ...rest } = parsed.data;
    const result = await runAutomationAction(action, rest);
    sendResult(res, result);
  }),
);

/** Express error boundary — never crash the process on route errors. */
export function automationErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error("[Playwright] Unhandled route error", err);
  if (res.headersSent) return;
  sendResult(res, {
    success: false,
    error: err instanceof Error ? err.message : "Internal automation error",
    code: "INTERNAL",
    logs: [],
    data:
      err instanceof Error && err.stack
        ? { stack: err.stack }
        : undefined,
  });
}
