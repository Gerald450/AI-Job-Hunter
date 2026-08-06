/**
 * React Query + messaging hooks for the popup / options UIs.
 */

import { useCallback, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  ExtensionMessage,
  ExtensionResponse,
  ExtensionSettings,
  ExtensionStatus,
  JobAnalysisResponse,
} from "@/types";

function sendMessage<T = unknown>(
  message: ExtensionMessage,
): Promise<ExtensionResponse<T>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response: ExtensionResponse<T>) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response ?? { ok: false, error: "Empty response" });
    });
  });
}

export function useExtensionStatus() {
  return useQuery({
    queryKey: ["extension-status"],
    queryFn: async () => {
      const res = await sendMessage<ExtensionStatus>({ type: "GET_STATUS" });
      if (!res.ok || !res.data) throw new Error(res.error || "Failed to load status");
      return res.data;
    },
    refetchInterval: 8_000,
  });
}

export function useSettings() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await sendMessage<ExtensionSettings>({ type: "GET_SETTINGS" });
      if (!res.ok || !res.data) throw new Error(res.error || "Failed to load settings");
      return res.data;
    },
  });

  const mutation = useMutation({
    mutationFn: async (partial: Partial<ExtensionSettings>) => {
      const res = await sendMessage<ExtensionSettings>({
        type: "UPDATE_SETTINGS",
        payload: partial,
      });
      if (!res.ok || !res.data) throw new Error(res.error || "Failed to save settings");
      return res.data;
    },
    onSuccess: (data) => {
      qc.setQueryData(["settings"], data);
      void qc.invalidateQueries({ queryKey: ["extension-status"] });
    },
  });

  return { ...query, save: mutation.mutateAsync, saving: mutation.isPending };
}

export function useAutofill() {
  return useMutation({
    mutationFn: async () => {
      const res = await sendMessage({ type: "AUTOFILL_PAGE" });
      if (!res.ok) throw new Error(res.error || "Autofill failed");
      return res.data;
    },
  });
}

export function useAnalyzeJob() {
  return useMutation({
    mutationFn: async () => {
      const res = await sendMessage<JobAnalysisResponse>({ type: "ANALYZE_JOB" });
      if (!res.ok) throw new Error(res.error || "Analysis failed");
      return res.data;
    },
  });
}

export function useNotification() {
  const [toast, setToast] = useState<{
    kind: "success" | "error" | "info" | "warning";
    title: string;
    message?: string;
  } | null>(null);

  const notify = useCallback(
    (
      kind: "success" | "error" | "info" | "warning",
      title: string,
      message?: string,
    ) => {
      setToast({ kind, title, message });
    },
    [],
  );

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  return { toast, notify, clear: () => setToast(null) };
}

export { sendMessage };
