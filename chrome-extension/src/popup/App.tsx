import { useEffect } from "react";
import clsx from "clsx";
import {
  useAnalyzeClipboard,
  useAnalyzeJob,
  useAnalyzeSelection,
  useAutofill,
  useExtensionStatus,
  useNotification,
  usePageSelection,
  useSettings,
  sendMessage,
} from "@/hooks/useExtension";

function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span
        className={clsx(
          "inline-block h-2 w-2 rounded-full",
          ok ? "bg-[var(--color-success)]" : "bg-[var(--color-danger)]",
        )}
        aria-hidden
      />
      <span className="text-[var(--ink-muted)]">{label}</span>
    </div>
  );
}

function ToastBanner({
  toast,
}: {
  toast: { kind: string; title: string; message?: string };
}) {
  const styles: Record<string, string> = {
    success:
      "bg-[var(--color-success-soft)] text-[var(--color-success)] border-[var(--color-success)]/30",
    error:
      "bg-[var(--color-danger-soft)] text-[var(--color-danger)] border-[var(--color-danger)]/30",
    warning:
      "bg-[var(--color-warning-soft)] text-[var(--color-warning)] border-[var(--color-warning)]/30",
    info: "bg-[var(--color-accent-soft)] text-[var(--color-accent-hover)] border-[var(--color-accent)]/30",
  };
  return (
    <div
      className={clsx(
        "rounded-lg border px-3 py-2 text-[12px]",
        styles[toast.kind] ?? styles.info,
      )}
      role="status"
    >
      <div className="font-semibold">{toast.title}</div>
      {toast.message ? <div className="opacity-90 mt-0.5">{toast.message}</div> : null}
    </div>
  );
}

export function App() {
  const { data: status, isLoading, refetch } = useExtensionStatus();
  const { data: settings } = useSettings();
  const { data: selection } = usePageSelection();
  const autofill = useAutofill();
  const analyze = useAnalyzeJob();
  const analyzeSelection = useAnalyzeSelection();
  const analyzeClipboard = useAnalyzeClipboard();
  const { toast, notify } = useNotification();

  useEffect(() => {
    const on = Boolean(settings?.darkMode);
    document.documentElement.classList.toggle("dark", on);
    document.body.classList.toggle("dark", on);
  }, [settings?.darkMode]);

  const analyzing =
    analyze.isPending ||
    analyzeSelection.isPending ||
    analyzeClipboard.isPending;

  const selectionUsable = Boolean(selection?.usable);

  const notifyAnalyzeResult = (
    result: { overall_match?: number; score?: number } | undefined,
  ) => {
    const score = result?.overall_match ?? result?.score;
    notify(
      "success",
      "Resume Match Ready",
      score !== undefined
        ? `Score: ${score}/100 — see the page panel`
        : "See the page panel",
    );
  };

  const onAutofill = async () => {
    try {
      await autofill.mutateAsync();
      notify("success", "Autofill Complete", "Check the page for highlighted fields.");
      void refetch();
    } catch (err) {
      notify("error", "Autofill Failed", err instanceof Error ? err.message : "Unknown error");
    }
  };

  const onAnalyze = async () => {
    try {
      const result = await analyze.mutateAsync();
      notifyAnalyzeResult(result);
    } catch (err) {
      notify("error", "Analysis Failed", err instanceof Error ? err.message : "Unknown error");
    }
  };

  const onAnalyzeSelection = async () => {
    try {
      const result = await analyzeSelection.mutateAsync();
      notifyAnalyzeResult(result);
    } catch (err) {
      notify("error", "Analysis Failed", err instanceof Error ? err.message : "Unknown error");
    }
  };

  const onAnalyzeClipboard = async () => {
    try {
      const result = await analyzeClipboard.mutateAsync(undefined);
      notifyAnalyzeResult(result);
    } catch (err) {
      notify("error", "Analysis Failed", err instanceof Error ? err.message : "Unknown error");
    }
  };

  const onDashboard = () => {
    const url = settings?.dashboardUrl || "http://localhost:3000";
    void sendMessage({ type: "OPEN_TAB", payload: { url } });
  };

  const onSettings = () => {
    void chrome.runtime.openOptionsPage();
  };

  const dark = settings?.darkMode;

  return (
    <div className="w-[340px] min-h-[420px] relative overflow-hidden bg-[var(--surface)] text-[var(--ink)]">
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background: dark
            ? "radial-gradient(ellipse 80% 50% at 10% -10%, rgba(13,148,136,0.22), transparent), radial-gradient(ellipse 60% 40% at 100% 0%, rgba(36,48,68,0.8), transparent)"
            : "radial-gradient(ellipse 80% 55% at 0% -10%, rgba(13,148,136,0.16), transparent), radial-gradient(ellipse 50% 40% at 100% 0%, rgba(216,224,236,0.7), transparent)",
        }}
      />

      <div className="relative p-4 flex flex-col gap-4">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p
              className="font-[family-name:var(--font-display)] text-[22px] font-extrabold tracking-tight leading-none text-[var(--ink)]"
              style={{ letterSpacing: "-0.03em" }}
            >
              AI Job Hunter
            </p>
            <p className="mt-1 text-[12px] text-[var(--ink-muted)]">
              Autofill ATS applications in one click
            </p>
          </div>
          <span
            className={clsx(
              "shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
              dark
                ? "bg-[var(--surface-raised)] text-[var(--color-accent)]"
                : "bg-[var(--color-accent-soft)] text-[var(--color-accent-hover)]",
            )}
          >
            {status?.ats && status.ats !== "unknown" ? status.ats : "v1.0"}
          </span>
        </header>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-3 grid grid-cols-2 gap-2.5">
          {isLoading ? (
            <p className="col-span-2 text-[12px] text-[var(--ink-muted)]">Loading status…</p>
          ) : (
            <>
              <StatusDot ok={Boolean(status?.connected)} label="Extension connected" />
              <StatusDot ok={Boolean(status?.backendOnline)} label="Backend online" />
              <StatusDot
                ok={Boolean(status?.loggedIn)}
                label={status?.userEmail ? status.userEmail : "Not signed in"}
              />
              <StatusDot
                ok={Boolean(status?.resumeLoaded)}
                label={
                  status?.resumeFilename
                    ? status.resumeFilename
                    : "No resume loaded"
                }
              />
            </>
          )}
        </section>

        {toast ? <ToastBanner toast={toast} /> : null}

        <section className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void onAutofill()}
            disabled={autofill.isPending}
            className={clsx(
              "w-full rounded-xl px-4 py-3 text-[13px] font-semibold transition",
              "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]",
              "disabled:opacity-60 disabled:cursor-not-allowed",
              "shadow-[0_8px_20px_rgba(13,148,136,0.25)]",
            )}
          >
            {autofill.isPending ? "Filling…" : "Autofill Current Page"}
          </button>

          {selectionUsable ? (
            <button
              type="button"
              onClick={() => void onAnalyzeSelection()}
              disabled={analyzing}
              className="w-full rounded-xl px-4 py-2.5 text-[13px] font-semibold transition border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] text-[var(--color-accent-hover)] hover:border-[var(--color-accent)] disabled:opacity-60"
            >
              {analyzeSelection.isPending ? "Analyzing…" : "Analyze Selected Text"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void onAnalyze()}
              disabled={analyzing}
              className="w-full rounded-xl px-4 py-2.5 text-[13px] font-medium transition border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--ink)] hover:border-[var(--color-accent)]/40 disabled:opacity-60"
            >
              {analyze.isPending ? "Analyzing…" : "Analyze Resume"}
            </button>
          )}

          <button
            type="button"
            onClick={() => void onAnalyzeClipboard()}
            disabled={analyzing}
            className="w-full rounded-xl px-4 py-2.5 text-[13px] font-medium transition border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--ink)] hover:border-[var(--color-accent)]/40 disabled:opacity-60"
          >
            {analyzeClipboard.isPending ? "Analyzing…" : "Analyze from Clipboard"}
          </button>

          {selectionUsable ? (
            <button
              type="button"
              onClick={() => void onAnalyze()}
              disabled={analyzing}
              className="w-full rounded-xl px-4 py-2 text-[12px] font-medium transition text-[var(--ink-muted)] hover:text-[var(--ink)] disabled:opacity-60"
            >
              {analyze.isPending ? "Analyzing…" : "Analyze page (DOM / API)"}
            </button>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onDashboard}
              className="rounded-xl px-3 py-2.5 text-[12px] font-medium border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--ink)] hover:border-[var(--color-accent)]/40 transition"
            >
              Open Dashboard
            </button>
            <button
              type="button"
              onClick={onSettings}
              className="rounded-xl px-3 py-2.5 text-[12px] font-medium border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--ink)] hover:border-[var(--color-accent)]/40 transition"
            >
              Settings
            </button>
          </div>
        </section>

        <footer className="text-[10px] text-center pt-1 text-[var(--ink-muted)]">
          Works on any application form · ATS adapters optional
        </footer>
      </div>
    </div>
  );
}
