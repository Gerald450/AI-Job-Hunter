/**
 * DOM MutationObserver for dynamically rendered ATS forms.
 *
 * Many boards hydrate application forms after the initial paint. This observer
 * watches for newly inserted interactive fields and invokes a callback once
 * the burst of mutations settles (debounced).
 */

import { logger } from "@/lib/logger";

const SCOPE = "observers";

export type FieldMutationCallback = (addedNodes: Element[]) => void;

export interface ObserverHandle {
  disconnect: () => void;
  pause: () => void;
  resume: () => void;
}

/**
 * Observe `root` for added form controls. Debounces rapid mutation bursts
 * so callers don't re-process the same subtree dozens of times.
 */
export function observeFormMutations(
  callback: FieldMutationCallback,
  options: {
    root?: ParentNode;
    debounceMs?: number;
  } = {},
): ObserverHandle {
  const root = options.root ?? document.body;
  const debounceMs = options.debounceMs ?? 400;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let paused = false;
  const pending = new Set<Element>();

  const flush = () => {
    timer = null;
    if (paused || pending.size === 0) return;
    const nodes = Array.from(pending);
    pending.clear();
    logger.debug(SCOPE, `Mutation flush: ${nodes.length} nodes`);
    try {
      callback(nodes);
    } catch (err) {
      logger.error(SCOPE, "Observer callback failed", err);
    }
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, debounceMs);
  };

  const isInteractive = (el: Element): boolean =>
    el.matches?.("input, textarea, select, form") ||
    Boolean(el.querySelector?.("input, textarea, select"));

  const observer = new MutationObserver((mutations) => {
    if (paused) return;
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (isInteractive(node)) pending.add(node);
      });
    }
    if (pending.size > 0) schedule();
  });

  observer.observe(root, {
    childList: true,
    subtree: true,
  });

  logger.info(SCOPE, "MutationObserver attached");

  return {
    disconnect: () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
      logger.info(SCOPE, "MutationObserver disconnected");
    },
    pause: () => {
      paused = true;
    },
    resume: () => {
      paused = false;
    },
  };
}

/** Track processed field uids to avoid duplicate autofill passes. */
export function createProcessedTracker(): {
  has: (uid: string) => boolean;
  add: (uid: string) => void;
  clear: () => void;
  size: () => number;
} {
  const seen = new Set<string>();
  return {
    has: (uid) => seen.has(uid),
    add: (uid) => {
      seen.add(uid);
    },
    clear: () => seen.clear(),
    size: () => seen.size,
  };
}
