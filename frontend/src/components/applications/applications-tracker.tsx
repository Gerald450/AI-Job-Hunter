"use client";

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { ConferenceCard } from "@/components/conferences/conference-card";
import { JobCard } from "@/components/jobs/job-card";
import { EmptyState } from "@/components/jobs/empty-state";
import { ErrorState } from "@/components/jobs/error-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  fetchConferences,
  fetchJobs,
  setConferenceSaved,
  setConferenceTracking,
  setJobApplied,
  setJobFlagged,
  setJobSaved,
} from "@/lib/api";
import { safeConference, trackingLabel } from "@/lib/conferences";
import { resolveCompanyNames } from "@/lib/format";
import type { AppliedFilter, Job } from "@/types/job";
import type { Conference } from "@/types/conference";

const JOB_TABS: { value: AppliedFilter; label: string }[] = [
  { value: "applied", label: "Applied Jobs" },
  { value: "saved", label: "Saved Jobs" },
];

const CONFERENCE_TABS = [
  { value: "saved", label: "Saved" },
  { value: "interested", label: "Interested" },
  { value: "funding_application", label: "Funding Application" },
  { value: "applied", label: "Applied" },
  { value: "registered", label: "Registered" },
  { value: "attended", label: "Attended" },
] as const;

export function ApplicationsTracker() {
  const queryClient = useQueryClient();
  const [jobTab, setJobTab] = useState<AppliedFilter>("applied");
  const [conferenceTab, setConferenceTab] =
    useState<(typeof CONFERENCE_TABS)[number]["value"]>("saved");

  const jobsQuery = useInfiniteQuery({
    queryKey: ["jobs", { appliedFilter: jobTab }],
    queryFn: ({ pageParam }) =>
      fetchJobs({
        limit: 25,
        offset: pageParam,
        appliedFilter: jobTab,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _all, lastPageParam) =>
      lastPage.has_more ? lastPageParam + 25 : undefined,
  });

  const conferencesQuery = useInfiniteQuery({
    queryKey: ["conferences", "applications", conferenceTab],
    queryFn: ({ pageParam }) =>
      fetchConferences({
        limit: 25,
        offset: pageParam,
        recommended: false,
        location: "all",
        saved: conferenceTab === "saved" ? true : undefined,
        trackingStatus:
          conferenceTab === "saved" ? undefined : conferenceTab,
        includeNotEligible: true,
        includeNonUs: true,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _all, lastPageParam) =>
      lastPage.has_more ? lastPageParam + 25 : undefined,
  });

  const jobs = useMemo(() => {
    const flat = jobsQuery.data?.pages.flatMap((page) => page.jobs) ?? [];
    return resolveCompanyNames(flat);
  }, [jobsQuery.data]);

  const conferences = useMemo(() => {
    const flat =
      conferencesQuery.data?.pages.flatMap((page) => page.conferences) ?? [];
    return flat
      .map((item) => safeConference(item))
      .filter((item): item is Conference => Boolean(item));
  }, [conferencesQuery.data]);

  const jobAppliedMutation = useMutation({
    mutationFn: ({ jobId, applied }: { jobId: string; applied: boolean }) =>
      setJobApplied(jobId, applied),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
  const jobSavedMutation = useMutation({
    mutationFn: ({ jobId, saved }: { jobId: string; saved: boolean }) =>
      setJobSaved(jobId, saved),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
  const jobFlaggedMutation = useMutation({
    mutationFn: ({ jobId, flagged }: { jobId: string; flagged: boolean }) =>
      setJobFlagged(jobId, flagged),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });

  const confSavedMutation = useMutation({
    mutationFn: ({ id, saved }: { id: string; saved: boolean }) =>
      setConferenceSaved(id, saved),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["conferences"] });
    },
  });
  const confTrackingMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string | null }) =>
      setConferenceTracking(id, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["conferences"] });
    },
  });

  return (
    <div className="flex flex-col gap-10" data-testid="applications-tracker">
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">Jobs</h2>
        <TabBar
          ariaLabel="Job application filters"
          tabs={JOB_TABS}
          value={jobTab}
          onChange={setJobTab}
        />
        {jobsQuery.isError ? (
          <ErrorState
            message="Unable to load job applications. Try again."
            onRetry={() => {
              void jobsQuery.refetch();
            }}
          />
        ) : jobs.length === 0 && !jobsQuery.isLoading ? (
          <EmptyState
            message={
              jobTab === "saved"
                ? "No saved jobs yet."
                : "No applied jobs yet. Click Apply on a role to track it here."
            }
          />
        ) : (
          <div className="flex flex-col gap-4">
            {jobs.map((job: Job) => (
              <JobCard
                key={job.id}
                job={job}
                onToggleApplied={async (jobId, applied) => {
                  await jobAppliedMutation.mutateAsync({ jobId, applied });
                }}
                onToggleSaved={async (jobId, saved) => {
                  await jobSavedMutation.mutateAsync({ jobId, saved });
                }}
                onToggleFlagged={async (jobId, flagged) => {
                  await jobFlaggedMutation.mutateAsync({ jobId, flagged });
                }}
              />
            ))}
            {jobsQuery.hasNextPage ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void jobsQuery.fetchNextPage();
                }}
              >
                Load More
              </Button>
            ) : null}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">Conferences</h2>
        <TabBar
          ariaLabel="Conference tracking filters"
          tabs={CONFERENCE_TABS.map((tab) => ({
            value: tab.value,
            label: tab.label,
          }))}
          value={conferenceTab}
          onChange={setConferenceTab}
        />
        {conferencesQuery.isError ? (
          <ErrorState
            message="Unable to load conference tracking. Try again."
            onRetry={() => {
              void conferencesQuery.refetch();
            }}
          />
        ) : conferences.length === 0 && !conferencesQuery.isLoading ? (
          <EmptyState
            message={`No ${conferenceTab === "saved" ? "saved" : trackingLabel(conferenceTab).toLowerCase()} conferences yet.`}
          />
        ) : (
          <div className="flex flex-col gap-4">
            {conferences.map((conference) => (
              <ConferenceCard
                key={conference.id}
                conference={conference}
                onToggleSaved={async (id, saved) => {
                  await confSavedMutation.mutateAsync({ id, saved });
                }}
                onTrackingChange={async (id, status) => {
                  await confTrackingMutation.mutateAsync({ id, status });
                }}
              />
            ))}
            {conferencesQuery.hasNextPage ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void conferencesQuery.fetchNextPage();
                }}
              >
                Load More
              </Button>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

function TabBar<T extends string>({
  tabs,
  value,
  onChange,
  ariaLabel,
}: {
  tabs: readonly { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      className="inline-flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-100/80 p-1"
      role="tablist"
      aria-label={ariaLabel}
    >
      {tabs.map((tab) => {
        const selected = value === tab.value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.value)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              selected
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
