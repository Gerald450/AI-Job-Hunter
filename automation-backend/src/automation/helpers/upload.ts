/**
 * Safe file upload — path on disk or base64 buffer written to a temp file.
 */

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Page } from "playwright";
import type { AutomationLogger } from "../logger.js";
import type { FieldTarget } from "../types.js";
import { findElement, scrollIntoView } from "./selectors.js";
import { retry } from "./retry.js";

export interface UploadSource {
  path?: string;
  base64?: string;
  filename?: string;
  mimeType?: string;
}

async function resolveUploadPath(source: UploadSource): Promise<string> {
  if (source.path) return source.path;
  if (!source.base64) {
    throw new Error("Upload requires resumePath or resumeBase64");
  }
  const dir = await mkdtemp(path.join(tmpdir(), "aijh-resume-"));
  const filename = source.filename || "resume.pdf";
  const filePath = path.join(dir, filename);
  const buffer = Buffer.from(source.base64, "base64");
  await writeFile(filePath, buffer);
  return filePath;
}

export async function safeUpload(
  page: Page,
  target: FieldTarget | undefined,
  source: UploadSource,
  options: {
    retries?: number;
    timeoutMs?: number;
    logger?: AutomationLogger;
  } = {},
): Promise<string> {
  const logger = options.logger;
  const filePath = await resolveUploadPath(source);

  await retry(
    async () => {
      let locator;
      if (target) {
        locator = await findElement(page, target, {
          timeoutMs: options.timeoutMs,
          visible: false,
          logger,
          retries: 1,
        });
      } else {
        locator = page.locator('input[type="file"]').first();
        await locator.waitFor({
          state: "attached",
          timeout: options.timeoutMs ?? 8_000,
        });
      }

      await scrollIntoView(locator, logger).catch(() => undefined);
      await locator.setInputFiles(filePath);
      logger?.info("Uploaded Resume", { path: filePath });
    },
    {
      retries: options.retries ?? 3,
      label: "safeUpload",
      logger,
    },
  );

  return filePath;
}
