"use client";

import { Check, ExternalLink, Loader2 } from "lucide-react";
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
}

export function JobCard({ job, onToggleApplied }: JobCardProps) {
  const applyUrl = job.apply_url;
  const canApply = Boolean(applyUrl);
  const [isUpdating, setIsUpdating] = useState(false);

  async function handleApply() {
    if (!applyUrl || isUpdating) return;

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
    if (isUpdating) return;

    setIsUpdating(true);
    try {
      await onToggleApplied(job.id, false);
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <Card className="rounded-xl border border-border/80 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
      <CardHeader className="gap-2 pb-3">
        <CardTitle className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
          {job.company}
        </CardTitle>
        <p className="text-base font-medium text-slate-700 sm:text-lg">
          {job.role}
        </p>
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
        {job.applied ? (
          <>
            <span className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200">
              <Check className="size-4" aria-hidden />
              Applied
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isUpdating}
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
          <button
            type="button"
            onClick={() => {
              void handleApply();
            }}
            disabled={isUpdating}
            className={cn(
              buttonVariants({ size: "lg" }),
              "w-full bg-blue-600 text-white hover:bg-blue-700 sm:ml-auto sm:w-auto",
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
