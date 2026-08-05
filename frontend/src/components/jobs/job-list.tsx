"use client";

import { useQuery } from "@tanstack/react-query";

import { EmptyState } from "@/components/jobs/empty-state";
import { ErrorState } from "@/components/jobs/error-state";
import { JobCard } from "@/components/jobs/job-card";
import { JobListSkeleton } from "@/components/jobs/job-list-skeleton";
import { fetchJobs } from "@/lib/api";
import { resolveCompanyNames } from "@/lib/format";

export function JobList() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["jobs"],
    queryFn: fetchJobs,
  });

  if (isLoading) {
    return <JobListSkeleton />;
  }

  if (isError) {
    return (
      <ErrorState
        message={
          error instanceof Error
            ? error.message
            : "We couldn't load jobs from the server."
        }
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  const jobs = resolveCompanyNames(data ?? []);

  if (jobs.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-500">
        {jobs.length === 1
          ? "Showing 1 open role"
          : `Showing ${jobs.length} open roles`}
        {isFetching ? " · Refreshing…" : ""}
      </p>
      {jobs.map((job) => (
        <JobCard key={job.id} job={job} />
      ))}
    </div>
  );
}
