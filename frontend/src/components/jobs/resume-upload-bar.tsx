"use client";

import { FileUp, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { uploadResume } from "@/lib/api";
import { cn } from "@/lib/utils";

const RESUME_ID_KEY = "aijh_resume_id";
const RESUME_NAME_KEY = "aijh_resume_filename";

export function loadStoredResume(): { resumeId: string; filename: string } | null {
  if (typeof window === "undefined") return null;
  const resumeId = window.localStorage.getItem(RESUME_ID_KEY);
  const filename = window.localStorage.getItem(RESUME_NAME_KEY);
  if (!resumeId || !filename) return null;
  return { resumeId, filename };
}

export function storeResume(resumeId: string, filename: string) {
  window.localStorage.setItem(RESUME_ID_KEY, resumeId);
  window.localStorage.setItem(RESUME_NAME_KEY, filename);
}

export function clearStoredResume() {
  window.localStorage.removeItem(RESUME_ID_KEY);
  window.localStorage.removeItem(RESUME_NAME_KEY);
}

interface ResumeUploadBarProps {
  resumeId: string | null;
  filename: string | null;
  onUploaded: (resumeId: string, filename: string) => void;
  onCleared: () => void;
}

export function ResumeUploadBar({
  resumeId,
  filename,
  onUploaded,
  onCleared,
}: ResumeUploadBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const result = await uploadResume(file);
      storeResume(result.resumeId, result.filename);
      onUploaded(result.resumeId, result.filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900">Resume for matching</p>
          {resumeId && filename ? (
            <p className="mt-0.5 truncate text-sm text-slate-500">
              {filename}
              <span className="ml-2 font-mono text-xs text-slate-400">
                {resumeId}
              </span>
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-slate-500">
              Upload a PDF or DOCX once — analyses reuse the parsed resume.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => {
              void handleFile(e.target.files?.[0]);
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className={cn("gap-1.5")}
          >
            {uploading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <FileUp className="size-4" aria-hidden />
            )}
            {uploading ? "Parsing…" : resumeId ? "Replace resume" : "Upload resume"}
          </Button>
          {resumeId ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                clearStoredResume();
                onCleared();
              }}
              className="text-slate-500"
            >
              <X className="size-3.5" aria-hidden />
              Clear
            </Button>
          ) : null}
        </div>
      </div>
      {error ? (
        <p className="mt-2 whitespace-pre-wrap text-sm text-red-600">{error}</p>
      ) : null}
    </div>
  );
}
