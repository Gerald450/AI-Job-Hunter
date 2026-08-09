import { useEffect, useState } from "react";
import clsx from "clsx";
import { useNotification, useSettings } from "@/hooks/useExtension";
import type { ExtensionSettings, UserProfile } from "@/types";
import { DEFAULT_PROFILE_VALUES, UserProfileSchema } from "@/types";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-[var(--ink)]">{label}</span>
      {children}
      {hint ? (
        <span className="text-[11px] text-[var(--ink-muted)]">{hint}</span>
      ) : null}
    </label>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-4 w-full text-left py-2"
    >
      <div>
        <div className="text-[13px] font-medium text-[var(--ink)]">{label}</div>
        {description ? (
          <div className="text-[11px] text-[var(--ink-muted)] mt-0.5">{description}</div>
        ) : null}
      </div>
      <span
        className={clsx(
          "relative h-6 w-11 shrink-0 rounded-full transition",
          checked ? "bg-[var(--color-accent)]" : "bg-[var(--border)]",
        )}
      >
        <span
          className={clsx(
            "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition",
            checked && "translate-x-5",
          )}
        />
      </span>
    </button>
  );
}

const inputClass =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--input-bg)] text-[var(--input-text)] px-3 py-2 text-[13px] outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/25 placeholder:text-[var(--placeholder)]";

const EMPTY_PROFILE: UserProfile = { ...DEFAULT_PROFILE_VALUES };

export function App() {
  const { data, isLoading, save, saving } = useSettings();
  const { toast, notify } = useNotification();
  /** Local overrides on top of persisted settings — avoids syncing via effect. */
  const [draft, setDraft] = useState<Partial<ExtensionSettings>>({});
  const [profile, setProfile] = useState<UserProfile>(EMPTY_PROFILE);
  const [profileSaving, setProfileSaving] = useState(false);

  const form: ExtensionSettings | null = data ? { ...data, ...draft } : null;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", Boolean(form?.darkMode));
    document.body.classList.toggle("dark", Boolean(form?.darkMode));
  }, [form?.darkMode]);

  useEffect(() => {
    void chrome.runtime
      .sendMessage({ type: "GET_PROFILE" })
      .then((res: { ok?: boolean; data?: UserProfile }) => {
        if (res?.ok && res.data) setProfile(res.data);
      })
      .catch(() => {
        /* ignore */
      });
  }, []);

  if (isLoading || !form) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[13px] text-[var(--ink-muted)] bg-[var(--surface)]">
        Loading settings…
      </div>
    );
  }

  const set = <K extends keyof ExtensionSettings>(key: K, value: ExtensionSettings[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const setProfileField = <K extends keyof UserProfile>(
    key: K,
    value: UserProfile[K],
  ) => {
    setProfile((prev) => ({ ...prev, [key]: value }));
  };

  const onSave = async () => {
    try {
      await save(form);
      setDraft({});
      notify("success", "Settings Saved");
    } catch (err) {
      notify("error", "Save Failed", err instanceof Error ? err.message : "Unknown error");
    }
  };

  const onSaveProfile = async () => {
    setProfileSaving(true);
    try {
      const parsed = UserProfileSchema.parse(profile);
      const res = (await chrome.runtime.sendMessage({
        type: "UPDATE_PROFILE",
        payload: parsed,
      })) as { ok?: boolean; data?: UserProfile; error?: string };
      if (!res?.ok) throw new Error(res?.error || "Failed to save profile");
      if (res.data) setProfile(res.data);
      notify("success", "Profile Saved", "Contact fields will be used for autofill");
    } catch (err) {
      notify(
        "error",
        "Profile Save Failed",
        err instanceof Error ? err.message : "Unknown error",
      );
    } finally {
      setProfileSaving(false);
    }
  };

  return (
    <div className="min-h-screen relative bg-[var(--surface)] text-[var(--ink)]">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: form.darkMode
            ? "radial-gradient(ellipse 70% 40% at 20% 0%, rgba(13,148,136,0.18), transparent), radial-gradient(ellipse 50% 30% at 90% 10%, rgba(36,48,68,0.6), transparent)"
            : "radial-gradient(ellipse 70% 40% at 20% 0%, rgba(13,148,136,0.14), transparent), radial-gradient(ellipse 50% 30% at 90% 10%, rgba(216,224,236,0.5), transparent)",
        }}
      />

      <div className="relative max-w-xl mx-auto px-6 py-10">
        <header className="mb-8">
          <p
            className="font-[family-name:var(--font-display)] text-[28px] font-extrabold tracking-tight text-[var(--ink)]"
            style={{ letterSpacing: "-0.03em" }}
          >
            AI Job Hunter
          </p>
          <p className="mt-1 text-[14px] text-[var(--ink-muted)]">
            Configure backend connection, resume, contact profile, and autofill
            behavior.
          </p>
        </header>

        {toast ? (
          <div
            className={clsx(
              "mb-4 rounded-lg border px-3 py-2 text-[12px]",
              toast.kind === "success" &&
                "bg-[var(--color-success-soft)] text-[var(--color-success)] border-[var(--color-success)]/30",
              toast.kind === "error" &&
                "bg-[var(--color-danger-soft)] text-[var(--color-danger)] border-[var(--color-danger)]/30",
            )}
            role="status"
          >
            <strong>{toast.title}</strong>
            {toast.message ? ` — ${toast.message}` : null}
          </div>
        ) : null}

        <div className="flex flex-col gap-6 rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-6 shadow-[0_12px_40px_rgba(12,18,34,0.06)]">
          <section className="flex flex-col gap-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
              Connection
            </h2>
            <Field label="Backend URL" hint="FastAPI server base URL">
              <input
                className={inputClass}
                value={form.backendUrl}
                onChange={(e) => set("backendUrl", e.target.value)}
                placeholder="http://localhost:8000"
              />
            </Field>
            <Field
              label="Automation URL"
              hint="Playwright fallback API (used only when content-script autofill cannot finish)"
            >
              <input
                className={inputClass}
                value={form.automationUrl}
                onChange={(e) => set("automationUrl", e.target.value)}
                placeholder="http://localhost:8090"
              />
            </Field>
            <Field label="API Key" hint="Sent as X-API-Key header">
              <input
                className={inputClass}
                type="password"
                value={form.apiKey}
                onChange={(e) => set("apiKey", e.target.value)}
                placeholder="Optional"
                autoComplete="off"
              />
            </Field>
            <Field label="JWT" hint="Bearer token for authenticated endpoints">
              <input
                className={inputClass}
                type="password"
                value={form.jwt}
                onChange={(e) => set("jwt", e.target.value)}
                placeholder="Optional"
                autoComplete="off"
              />
            </Field>
            <Field label="Dashboard URL">
              <input
                className={inputClass}
                value={form.dashboardUrl}
                onChange={(e) => set("dashboardUrl", e.target.value)}
                placeholder="http://localhost:3000"
              />
            </Field>
          </section>

          <section className="flex flex-col gap-4 border-t border-[var(--border)] pt-5">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
              Resume
            </h2>
            <Field label="Resume ID" hint="Backend identifier for your default resume">
              <input
                className={inputClass}
                value={form.resumeId}
                onChange={(e) => set("resumeId", e.target.value)}
                placeholder="resume_abc123"
              />
            </Field>
            <Field label="Resume Filename">
              <input
                className={inputClass}
                value={form.resumeFilename}
                onChange={(e) => set("resumeFilename", e.target.value)}
                placeholder="Gerald_Shimo_Resume.pdf"
              />
            </Field>
          </section>

          <section className="flex flex-col gap-4 border-t border-[var(--border)] pt-5">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
              Autofill contact profile
            </h2>
            <p className="text-[12px] text-[var(--ink-muted)] -mt-2">
              Required for name, email, and phone fields. Saved locally and kept
              when the resume profile syncs.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="First Name">
                <input
                  className={inputClass}
                  value={profile.firstName ?? ""}
                  onChange={(e) => setProfileField("firstName", e.target.value)}
                  autoComplete="given-name"
                />
              </Field>
              <Field label="Last Name">
                <input
                  className={inputClass}
                  value={profile.lastName ?? ""}
                  onChange={(e) => setProfileField("lastName", e.target.value)}
                  autoComplete="family-name"
                />
              </Field>
            </div>
            <Field label="Email">
              <input
                className={inputClass}
                type="email"
                value={profile.email ?? ""}
                onChange={(e) => setProfileField("email", e.target.value)}
                autoComplete="email"
              />
            </Field>
            <Field label="Phone">
              <input
                className={inputClass}
                type="tel"
                value={profile.phone ?? ""}
                onChange={(e) => setProfileField("phone", e.target.value)}
                autoComplete="tel"
              />
            </Field>
            <Field label="LinkedIn">
              <input
                className={inputClass}
                value={profile.linkedin ?? ""}
                onChange={(e) => setProfileField("linkedin", e.target.value)}
                placeholder="https://linkedin.com/in/…"
              />
            </Field>
            <Field label="Location / Address">
              <input
                className={inputClass}
                value={profile.location ?? ""}
                onChange={(e) => setProfileField("location", e.target.value)}
                placeholder="1200 N University Dr, Pine Bluff Ar 71601"
                autoComplete="street-address"
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Gender / Sex">
                <input
                  className={inputClass}
                  value={profile.gender ?? ""}
                  onChange={(e) => setProfileField("gender", e.target.value)}
                  placeholder="Male"
                />
              </Field>
              <Field label="Race / Ethnicity">
                <input
                  className={inputClass}
                  value={profile.race ?? ""}
                  onChange={(e) => setProfileField("race", e.target.value)}
                  placeholder="Black or African American"
                />
              </Field>
              <Field label="Disability">
                <input
                  className={inputClass}
                  value={profile.disability ?? ""}
                  onChange={(e) => setProfileField("disability", e.target.value)}
                  placeholder="No"
                />
              </Field>
              <Field label="Veteran Status">
                <input
                  className={inputClass}
                  value={profile.veteran ?? ""}
                  onChange={(e) => setProfileField("veteran", e.target.value)}
                  placeholder="I'm not a protected veteran, or I'm not a veteran"
                />
              </Field>
            </div>
            <Field label="How Did You Hear About Us?">
              <input
                className={inputClass}
                value={profile.hearAboutUs ?? ""}
                onChange={(e) => setProfileField("hearAboutUs", e.target.value)}
                placeholder="LinkedIn"
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Degree">
                <input
                  className={inputClass}
                  value={profile.degree ?? ""}
                  onChange={(e) => setProfileField("degree", e.target.value)}
                  placeholder="Bachelors"
                />
              </Field>
              <Field label="Field of Study">
                <input
                  className={inputClass}
                  value={profile.fieldOfStudy ?? ""}
                  onChange={(e) => setProfileField("fieldOfStudy", e.target.value)}
                  placeholder="Computer Science"
                />
              </Field>
            </div>
            <Field label="Desired hourly rate or annual salary">
              <input
                className={inputClass}
                value={profile.desiredSalary ?? ""}
                onChange={(e) => setProfileField("desiredSalary", e.target.value)}
                placeholder="100000"
              />
            </Field>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Toggle
                label="Legally eligible to work"
                description="Are you legally eligible to work in the country you are applying to?"
                checked={Boolean(profile.authorizedToWork)}
                onChange={(v) => setProfileField("authorizedToWork", v)}
              />
              <Toggle
                label="Requires visa sponsorship"
                description="Will you now or in the future require sponsorship for employment visa status?"
                checked={Boolean(profile.requiresSponsorship)}
                onChange={(v) => setProfileField("requiresSponsorship", v)}
              />
              <Toggle
                label="At least 18 years of age"
                checked={Boolean(profile.atLeast18)}
                onChange={(v) => setProfileField("atLeast18", v)}
              />
            </div>
            <button
              type="button"
              onClick={() => void onSaveProfile()}
              disabled={profileSaving}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-raised)] font-semibold text-[13px] py-2.5 transition disabled:opacity-60"
            >
              {profileSaving ? "Saving profile…" : "Save Contact Profile"}
            </button>
          </section>

          <section className="flex flex-col gap-1 border-t border-[var(--border)] pt-5">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)] mb-2">
              Behavior
            </h2>
            <Toggle
              label="Auto Fill Enabled"
              description="Allow the extension to fill form fields"
              checked={form.autoFillEnabled}
              onChange={(v) => set("autoFillEnabled", v)}
            />
            <Toggle
              label="Auto Upload Resume"
              description="Attach your resume to file inputs when present"
              checked={form.autoUploadResume}
              onChange={(v) => set("autoUploadResume", v)}
            />
            <Toggle
              label="Auto Answer Questions"
              description="Fill screening questions from your profile / backend"
              checked={form.autoAnswerQuestions}
              onChange={(v) => set("autoAnswerQuestions", v)}
            />
            <Toggle
              label="Playwright Fallback"
              description="After normal autofill, retry hard fields via local browser automation (CDP). Never runs first."
              checked={form.playwrightFallbackEnabled}
              onChange={(v) => set("playwrightFallbackEnabled", v)}
            />
            <Toggle
              label="Dark Mode"
              checked={form.darkMode}
              onChange={(v) => set("darkMode", v)}
            />
            <Toggle
              label="Debug Logging"
              description="Verbose console logs for troubleshooting"
              checked={form.debugLogging}
              onChange={(v) => set("debugLogging", v)}
            />
            <Field
              label="Confidence Threshold"
              hint="AI matches below this score are highlighted for review (0–1)"
            >
              <input
                className={inputClass}
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={form.confidenceThreshold}
                onChange={(e) => set("confidenceThreshold", Number(e.target.value))}
              />
            </Field>
          </section>

          <button
            type="button"
            onClick={() => void onSave()}
            disabled={saving}
            className="mt-2 rounded-xl bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white font-semibold text-[13px] py-3 transition disabled:opacity-60 shadow-[0_8px_20px_rgba(13,148,136,0.25)]"
          >
            {saving ? "Saving…" : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}
