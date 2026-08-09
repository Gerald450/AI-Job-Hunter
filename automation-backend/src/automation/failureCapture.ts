/**
 * Failure artifacts: screenshots + HTML snapshots + stack traces.
 * Never throws — capture is best-effort so the API always returns cleanly.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "playwright";
import type { AutomationLogger } from "./logger.js";

export interface FailureArtifacts {
  screenshot?: string;
  html?: string;
  stack?: string;
}

function artifactsRoot(): string {
  return process.env.ARTIFACTS_DIR ?? path.resolve("artifacts");
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export async function captureFailure(
  page: Page | null | undefined,
  err: unknown,
  logger: AutomationLogger,
  label = "failure",
): Promise<FailureArtifacts> {
  const stack = err instanceof Error ? err.stack ?? err.message : String(err);
  const result: FailureArtifacts = { stack };
  const id = `${stamp()}-${label.replace(/\W+/g, "_").slice(0, 40)}`;

  try {
    const shotDir = path.join(artifactsRoot(), "screenshots");
    const htmlDir = path.join(artifactsRoot(), "html");
    await mkdir(shotDir, { recursive: true });
    await mkdir(htmlDir, { recursive: true });

    if (page && !page.isClosed()) {
      const shotPath = path.join(shotDir, `${id}.png`);
      await page.screenshot({ path: shotPath, fullPage: true }).catch(() => undefined);
      result.screenshot = shotPath;
      logger.info(`Saved failure screenshot`, { path: shotPath });

      const htmlPath = path.join(htmlDir, `${id}.html`);
      const html = await page.content().catch(() => "");
      if (html) {
        await writeFile(htmlPath, html, "utf8");
        result.html = htmlPath;
        logger.info(`Saved failure HTML snapshot`, { path: htmlPath });
      }
    }

    const tracePath = path.join(htmlDir, `${id}.stack.txt`);
    await writeFile(tracePath, stack, "utf8");
  } catch (captureErr) {
    logger.warn("Failed to capture failure artifacts", captureErr);
  }

  return result;
}
