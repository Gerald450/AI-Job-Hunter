"use client";

import { Bookmark, Check, ExternalLink, Flag, Loader2 } from "lucide-react";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatPostedAge } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Job } from "@/types/job";

interface JobCardProps {
  job: Job;
  onToggleApplied: (jobId: string, applied: boolean) => Promise<void>;
  onToggleSaved: (jobId: string, saved: boolean) => Promise<void>;
  onToggleFlagged: (jobId: string, flagged: boolean) => Promise<void>;
  selected?: boolean;
  onSelectChange?: (jobId: string, selected: boolean) => void;
  matchScore?: number | null;
  onAnalyze?: (job: Job) => void;
  analyzing?: boolean;
  canAnalyze?: boolean;
}

function matchBadgeClass(score: number): string {
  if (score >= 75) return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  if (score >= 50) return "bg-amber-50 text-amber-800 ring-amber-200";
  return "bg-rose-50 text-rose-800 ring-rose-200";
}

export function JobCard({
  job,
  onToggleApplied,
  onToggleSaved,
  onToggleFlagged,
  selected = false,
  onSelectChange,
  matchScore,
  onAnalyze,
  analyzing = false,
  canAnalyze = false,
}: JobCardProps) {
  const applyUrl = job.apply_url;
  const canApply = Boolean(applyUrl);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isFlagging, setIsFlagging] = useState(false);

  async function handleApply() {
    if (!applyUrl || isUpdating || isSaving || isFlagging) return;

    window.open(applyUrl, "_blank", "noopener,noreferrer");

    if (job.applied) return;

    setIsUpdating(true);
    try {
      await onToggleApplied(job.id, true);
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleMarkUnapplied() {
    if (isUpdating || isSaving || isFlagging) return;

    setIsUpdating(true);
    try {
      await onToggleApplied(job.id, false);
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleToggleSaved() {
    if (isUpdating || isSaving || isFlagging) return;

    setIsSaving(true);
    try {
      await onToggleSaved(job.id, !job.saved);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleFlagged() {
    if (isUpdating || isSaving || isFlagging) return;

    setIsFlagging(true);
    try {
      await onToggleFlagged(job.id, !job.flagged);
    } finally {
      setIsFlagging(false);
    }
  }

  const busy = isUpdating || isSaving || isFlagging;

  return (
    <Card className="rounded-xl border border-border/80 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
      <CardHeader className="gap-2 pb-3">
        <div className="flex items-start gap-3">
          {onSelectChange ? (
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => onSelectChange(job.id, e.target.checked)}
              className="mt-1.5 size-4 rounded border-slate-300"
              aria-label={`Select ${job.company} ${job.role}`}
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                {job.company}
              </CardTitle>
              {matchScore != null ? (
                <span
                  className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ${matchBadgeClass(matchScore)}`}
                >
                  Match {matchScore}
                </span>
              ) : null}
              {job.saved ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                  <Bookmark className="size-3 fill-current" aria-hidden />
                  Saved
                </span>
              ) : null}
              {job.flagged ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-800 ring-1 ring-rose-200">
                  <Flag className="size-3 fill-current" aria-hidden />
                  Flagged
                </span>
              ) : null}
            </div>
            <p className="text-base font-medium text-slate-700 sm:text-lg">
              {job.role}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-1.5 pb-4 text-sm text-slate-500">
        <p>
          <span className="font-medium text-slate-600">Source:</span>{" "}
          {job.ats_source}
        </p>
        <p>
          <span className="font-medium text-slate-600">Posted:</span>{" "}
          {formatPostedAge(job.age)}
        </p>
        {job.location ? (
          <p>
            <span className="font-medium text-slate-600">Location:</span>{" "}
            {job.location}
          </p>
        ) : null}
      </CardContent>

      <CardFooter className="flex flex-col items-stretch gap-2 pt-0 sm:flex-row sm:items-center sm:justify-end">
        {onAnalyze ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canAnalyze || analyzing || busy}
            onClick={() => onAnalyze(job)}
            className="sm:mr-auto"
          >
            {analyzing ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : null}
            Analyze Resume
          </Button>
        ) : null}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => {
            void handleToggleSaved();
          }}
          className={
            job.saved
              ? "text-amber-700 hover:bg-amber-50 hover:text-amber-800"
              : "text-slate-500 hover:text-slate-700"
          }
          aria-label={
            job.saved
              ? `Unsave ${job.company} ${job.role}`
              : `Save ${job.company} ${job.role}`
          }
        >
          {isSaving ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Bookmark
              className={cn("size-3.5", job.saved && "fill-current")}
              aria-hidden
            />
          )}
          {job.saved ? "Saved" : "Save"}
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => {
            void handleToggleFlagged();
          }}
          className={
            job.flagged
              ? "text-rose-700 hover:bg-rose-50 hover:text-rose-800"
              : "text-slate-500 hover:text-slate-700"
          }
          aria-label={
            job.flagged
              ? `Unflag ${job.company} ${job.role}`
              : `Flag ${job.company} ${job.role}`
          }
        >
          {isFlagging ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Flag
              className={cn("size-3.5", job.flagged && "fill-current")}
              aria-hidden
            />
          )}
          {job.flagged ? "Unflag" : "Flag"}
        </Button>

        {job.applied ? (
          <>
            <span className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200">
              <Check className="size-4" aria-hidden />
              Applied
            </span>
            {canApply ? (
              <Button
                type="button"
                size="lg"
                disabled={busy}
                onClick={() => {
                  window.open(applyUrl!, "_blank", "noopener,noreferrer");
                }}
                className="w-full bg-blue-600 text-white hover:bg-blue-700 sm:w-auto"
                aria-label={`Open job posting for ${job.company} ${job.role}`}
              >
                View posting
                <ExternalLink className="size-4" aria-hidden />
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                void handleMarkUnapplied();
              }}
              className="text-slate-500 hover:text-slate-700"
            >
              {isUpdating ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : null}
              Mark Unapplied
            </Button>
          </>
        ) : canApply ? (
          <>
            <Button
              type="button"
              size="lg"
              variant="outline"
              disabled={busy}
              onClick={() => {
                window.open(applyUrl!, "_blank", "noopener,noreferrer");
              }}
              className="w-full sm:ml-auto sm:w-auto"
              aria-label={`View job posting for ${job.company} ${job.role}`}
            >
              View post
              <ExternalLink className="size-4" aria-hidden />
            </Button>
            <button
              type="button"
              onClick={() => {
                void handleApply();
              }}
              disabled={busy}
              className={cn(
                buttonVariants({ size: "lg" }),
                "w-full bg-blue-600 text-white hover:bg-blue-700 sm:w-auto",
              )}
            >
              {isUpdating ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <>
                  Apply
                  <ExternalLink className="size-4" aria-hidden />
                </>
              )}
            </button>
          </>
        ) : (
          <Button
            disabled
            size="lg"
            className="w-full sm:ml-auto sm:w-auto"
            variant="secondary"
          >
            Link unavailable
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
