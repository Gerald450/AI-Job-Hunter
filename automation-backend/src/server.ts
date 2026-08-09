/**
 * Express server for Playwright CDP automation.
 *
 * Extension (primary) → this service (fallback only) → user's Chrome via CDP.
 */

import cors from "cors";
import express from "express";
import {
  automationErrorHandler,
  automationRouter,
} from "./routes/automation.js";
import { browserManager } from "./automation/browserManager.js";
import { sessionManager } from "./automation/sessionManager.js";

const PORT = Number(process.env.PORT) || 8090;

export function createApp() {
  const app = express();
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: "15mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "ai-job-hunter-automation" });
  });

  app.use("/automation", automationRouter);
  app.use(automationErrorHandler);

  return app;
}

export async function startServer(): Promise<void> {
  const app = createApp();

  const server = app.listen(PORT, () => {
    console.info(`[Playwright] Automation API listening on http://127.0.0.1:${PORT}`);
    console.info(`[Playwright] CDP target: ${process.env.CDP_URL || "http://127.0.0.1:9222"}`);
  });

  const shutdown = async (signal: string) => {
    console.info(`[Playwright] ${signal} received — shutting down`);
    await sessionManager.stopAll();
    await browserManager.disconnect();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5_000).unref();
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  // Do not crash on unhandled rejection from Playwright races
  process.on("unhandledRejection", (reason) => {
    console.error("[Playwright] Unhandled rejection", reason);
  });
}
