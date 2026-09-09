"use client";

import {
  Bookmark,
  ExternalLink,
  Loader2,
  MapPin,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { EligibilityBadge } from "@/components/conferences/eligibility-badge";
import { EligibilityReasons } from "@/components/conferences/eligibility-reasons";
import { MatchScore } from "@/components/conferences/match-score";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  TRACKING_OPTIONS,
  conferenceDeadlines,
  deadlineKindLabel,
  deadlineStatusText,
  eligibilityReasons,
  formatDate,
  formatDateRange,
  hasStudentFunding,
  hasTravelGrant,
  isDeadlineUrgent,
  locationLine,
  primaryDeadline,
  topicLabel,
} from "@/lib/conferences";
import { cn } from "@/lib/utils";
import type { Conference } from "@/types/conference";

interface ConferenceCardProps {
  conference: Conference;
  onToggleSaved: (id: string, saved: boolean) => Promise<void>;
  onTrackingChange: (id: string, status: string | null) => Promise<void>;
}

export function ConferenceCard({
  conference,
  onToggleSaved,
  onTrackingChange,
}: ConferenceCardProps) {
  const [saving, setSaving] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const reasons = eligibilityReasons(conference);
  const deadline = primaryDeadline(conference);
  const allDeadlines = conferenceDeadlines(conference);
  const topics = (conference.topics ?? []).filter(Boolean);
  const officialUrl = conference.official_url;
  const dates = formatDateRange(conference.start_date, conference.end_date);
  const busy = saving || updatingStatus;

  async function handleSave() {
    if (busy) return;
    setSaving(true);
    try {
      await onToggleSaved(conference.id, !conference.saved);
    } finally {
      setSaving(false);
    }
  }

  async function handleTracking(next: string) {
    if (busy) return;
    setUpdatingStatus(true);
    try {
      await onTrackingChange(conference.id, next || null);
    } finally {
      setUpdatingStatus(false);
    }
  }

  return (
    <Card
      data-testid="conference-card"
      data-eligibility={conference.eligibility_status}
      data-location-status={conference.location_status}
      className="rounded-xl border border-border/80 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
    >
      <CardHeader className="gap-2 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <MatchScore conference={conference} />
          <EligibilityBadge status={conference.eligibility_status} />
          {conference.saved ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
              <Bookmark className="size-3 fill-current" aria-hidden />
              Saved
            </span>
          ) : null}
        </div>
        <CardTitle className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
          <Link
            href={`/conferences/${conference.id}`}
            className="hover:text-blue-700"
          >
            {conference.name}
          </Link>
        </CardTitle>
        {conference.organization ? (
          <p className="text-base font-medium text-slate-700">
            {conference.organization}
          </p>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-3 pb-4 text-sm text-slate-600">
        <p className="flex items-start gap-1.5">
          <MapPin className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
          <span>
            {locationLine(conference)}
            {dates ? <span className="block text-slate-500">{dates}</span> : null}
          </span>
        </p>

        <EligibilityReasons reasons={reasons} />

        {hasStudentFunding(conference) ? (
          <p data-testid="funding-availability" className="font-medium text-amber-800">
            {hasTravelGrant(conference)
              ? "Student travel grant available"
              : "Student funding available"}
          </p>
        ) : null}

        {deadline ? (
          <div data-testid="primary-deadline">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Next deadline
            </p>
            <p className="font-medium text-slate-800">
              {deadlineKindLabel(deadline.kind)}
            </p>
            <p>
              {deadline.is_rolling
                ? "Rolling"
                : formatDate(deadline.deadline_at) || "Date unavailable"}
            </p>
            <p
              className={cn(
                "text-xs font-semibold",
                isDeadlineUrgent(deadline) ? "text-rose-700" : "text-slate-500",
              )}
            >
              {deadlineStatusText(deadline)}
            </p>
          </div>
        ) : null}

        {allDeadlines.length > 1 ? (
          <p className="text-xs text-slate-500">
            {allDeadlines.length} deadlines listed
          </p>
        ) : null}

        {conference.description ? (
          <p className="line-clamp-3 text-slate-600">{conference.description}</p>
        ) : null}

        {topics.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {topics.map((topic) => (
              <span
                key={topic}
                className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
              >
                {topicLabel(topic)}
              </span>
            ))}
          </div>
        ) : null}
      </CardContent>

      <CardFooter className="flex flex-col items-stretch gap-2 pt-0 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => {
            void handleSave();
          }}
          className={
            conference.saved
              ? "text-amber-700 hover:bg-amber-50 hover:text-amber-800"
              : "text-slate-500 hover:text-slate-700"
          }
        >
          {saving ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Bookmark
              className={cn("size-3.5", conference.saved && "fill-current")}
              aria-hidden
            />
          )}
          {conference.saved ? "Saved" : "Save"}
        </Button>

        <label className="flex items-center gap-2 text-xs font-medium text-slate-500 sm:mr-auto">
          <span className="sr-only">Tracking status</span>
          <select
            value={conference.tracking_status ?? ""}
            disabled={busy}
            onChange={(event) => {
              void handleTracking(event.target.value);
            }}
            className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700"
            aria-label={`Tracking status for ${conference.name}`}
          >
            <option value="">Not tracking</option>
            {TRACKING_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {updatingStatus ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : null}
        </label>

        <Link
          href={`/conferences/${conference.id}`}
          className={cn(
            buttonVariants({ size: "lg" }),
            "w-full bg-blue-600 text-white hover:bg-blue-700 sm:w-auto",
          )}
        >
          View Conference
        </Link>
        {officialUrl ? (
          <a
            href={officialUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              buttonVariants({ size: "lg", variant: "outline" }),
              "w-full sm:w-auto",
            )}
          >
            Official website
            <ExternalLink className="size-4" aria-hidden />
          </a>
        ) : null}
      </CardFooter>
    </Card>
  );
}
