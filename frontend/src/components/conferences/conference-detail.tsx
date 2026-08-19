"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, ExternalLink, Loader2, MapPin } from "lucide-react";
import { useState } from "react";

import { DeadlineList } from "@/components/conferences/deadline-list";
import { EligibilityBadge } from "@/components/conferences/eligibility-badge";
import { EligibilityReasons } from "@/components/conferences/eligibility-reasons";
import { FundingBlock } from "@/components/conferences/funding-block";
import { MatchScore } from "@/components/conferences/match-score";
import { ErrorState } from "@/components/jobs/error-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchConference,
  setConferenceSaved,
  setConferenceTracking,
} from "@/lib/api";
import {
  TRACKING_OPTIONS,
  conferenceDeadlines,
  eligibilityReasons,
  formatDateRange,
  locationLine,
  matchReasons,
  safeConference,
  studentFundingRows,
  topicLabel,
} from "@/lib/conferences";
import { cn } from "@/lib/utils";

export function ConferenceDetail({ conferenceId }: { conferenceId: string }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["conference", conferenceId],
    queryFn: () => fetchConference(conferenceId),
  });

  const conference = safeConference(data);

  const savedMutation = useMutation({
    mutationFn: (saved: boolean) => setConferenceSaved(conferenceId, saved),
    onSuccess: (next) => {
      queryClient.setQueryData(["conference", conferenceId], next);
      void queryClient.invalidateQueries({ queryKey: ["conferences"] });
    },
  });

  const trackingMutation = useMutation({
    mutationFn: (status: string | null) =>
      setConferenceTracking(conferenceId, status),
    onSuccess: (next) => {
      queryClient.setQueryData(["conference", conferenceId], next);
      void queryClient.invalidateQueries({ queryKey: ["conferences"] });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="conference-detail-skeleton">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (isError || !conference) {
    return (
      <ErrorState
        message={
          error instanceof Error
            ? error.message
            : "Unable to load this conference. Try again."
        }
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  const reasons = eligibilityReasons(conference);
  const deadlines = conferenceDeadlines(conference);
  const funding = studentFundingRows(conference);
  const reasonsMatch = matchReasons(conference);
  const topics = conference.topics ?? [];
  const officialUrl = conference.official_url;
  const busy = saving || updatingStatus;

  return (
    <article className="space-y-6" data-testid="conference-detail">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <MatchScore conference={conference} />
          <EligibilityBadge status={conference.eligibility_status} />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          {conference.name}
        </h1>
        {conference.organization ? (
          <p className="text-lg font-medium text-slate-700">
            {conference.organization}
          </p>
        ) : null}
        <p className="flex items-start gap-1.5 text-slate-600">
          <MapPin className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
          <span>
            {locationLine(conference)}
            {formatDateRange(conference.start_date, conference.end_date) ? (
              <span className="block">
                {formatDateRange(conference.start_date, conference.end_date)}
              </span>
            ) : null}
          </span>
        </p>
        {conference.description ? (
          <p className="max-w-2xl leading-relaxed text-slate-600">
            {conference.description}
          </p>
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

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {officialUrl ? (
            <a
              href={officialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonVariants({ size: "lg" }),
                "bg-blue-600 text-white hover:bg-blue-700",
              )}
            >
              Official website
              <ExternalLink className="size-4" aria-hidden />
            </a>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              setSaving(true);
              try {
                await savedMutation.mutateAsync(!conference.saved);
              } finally {
                setSaving(false);
              }
            }}
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
          <select
            value={conference.tracking_status ?? ""}
            disabled={busy}
            onChange={async (event) => {
              setUpdatingStatus(true);
              try {
                await trackingMutation.mutateAsync(event.target.value || null);
              } finally {
                setUpdatingStatus(false);
              }
            }}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700"
            aria-label="Tracking status"
          >
            <option value="">Not tracking</option>
            {TRACKING_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Your Eligibility</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <EligibilityBadge status={conference.eligibility_status} />
          <EligibilityReasons reasons={reasons} />
          {conference.eligibility_requirements ? (
            <p className="text-sm text-slate-600">
              {conference.eligibility_requirements}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Funding Opportunities</CardTitle>
        </CardHeader>
        <CardContent>
          {funding.length > 0 ? (
            <FundingBlock grants={funding} />
          ) : (
            <p className="text-sm text-slate-500">
              No student funding was returned for this conference.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Important Deadlines</CardTitle>
        </CardHeader>
        <CardContent>
          {deadlines.length > 0 ? (
            <DeadlineList deadlines={deadlines} />
          ) : (
            <p className="text-sm text-slate-500">No deadlines were returned.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Why This Conference Matches You</CardTitle>
        </CardHeader>
        <CardContent>
          {reasonsMatch.length > 0 ? (
            <ul className="space-y-1.5 text-sm text-slate-700" data-testid="detail-match-reasons">
              {reasonsMatch.map((reason) => (
                <li key={`${reason.factor}-${reason.why}`}>
                  <span className="font-semibold tabular-nums">
                    {reason.points >= 0 ? "+" : ""}
                    {reason.points}
                  </span>{" "}
                  {reason.why || reason.factor}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">
              No match factors were returned for this conference.
            </p>
          )}
        </CardContent>
      </Card>
    </article>
  );
}
