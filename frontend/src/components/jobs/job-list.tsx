"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryKey,
} from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AnalysisPanel } from "@/components/jobs/analysis-panel";
import { AnalyzeToolbar } from "@/components/jobs/analyze-toolbar";
import { BatchResults } from "@/components/jobs/batch-results";
import { EmptyState } from "@/components/jobs/empty-state";
import { ErrorState } from "@/components/jobs/error-state";
import { JobCard } from "@/components/jobs/job-card";
import { JobListSkeleton } from "@/components/jobs/job-list-skeleton";
import { JobSearchBar } from "@/components/jobs/job-search";
import {
  loadStoredResume,
  ResumeUploadBar,
} from "@/components/jobs/resume-upload-bar";
import { Button } from "@/components/ui/button";
import {
  analyzeJobResume,
  analyzeJobsBatch,
  DEFAULT_PAGE_SIZE,
  fetchJobs,
  setJobApplied,
  setJobFlagged,
  setJobSaved,
} from "@/lib/api";
import { resolveCompanyNames } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  AnalysisResult,
  BatchJobResult,
  BatchProgress,
  BatchSort,
} from "@/types/analysis";
import type {
  AppliedFilter,
  Job,
  JobListResponse,
  JobSearchFilters,
  JobStats,
} from "@/types/job";

const FILTERS: { value: AppliedFilter; label: string }[] = [
  { value: "all", label: "All Jobs" },
  { value: "not_applied", label: "Not Applied" },
  { value: "applied", label: "Applied" },
  { value: "saved", label: "Saved" },
  { value: "flagged", label: "Flagged" },
];

const EMPTY_SEARCH: JobSearchFilters = {
  company: "",
  source: "",
  maxAge: "",
};

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

function JobStatsBar({ stats }: { stats: JobStats }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Total Jobs
        </p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
          {formatCount(stats.total)}
        </p>
      </div>
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
          Applied
        </p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-800">
          {formatCount(stats.applied)}
        </p>
      </div>
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
          Saved
        </p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-800">
          {formatCount(stats.saved)}
        </p>
      </div>
      <div className="rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-3 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-rose-700">
          Flagged
        </p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-rose-800">
          {formatCount(stats.flagged ?? 0)}
        </p>
      </div>
      <div className="rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-3 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-blue-700">
          Remaining
        </p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-blue-800">
          {formatCount(stats.remaining)}
        </p>
      </div>
    </div>
  );
}

function AppliedFilterBar({
  value,
  onChange,
}: {
  value: AppliedFilter;
  onChange: (next: AppliedFilter) => void;
}) {
  return (
    <div
      className="inline-flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-100/80 p-1"
      role="tablist"
      aria-label="Filter jobs"
    >
      {FILTERS.map((filter) => {
        const selected = value === filter.value;
        return (
          <button
            key={filter.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(filter.value)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              selected
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            {filter.label}
          </button>
        );
      })}
    </div>
  );
}

function dedupeJobs(jobs: Job[]): Job[] {
  const seen = new Set<string>();
  const unique: Job[] = [];

  for (const job of jobs) {
    if (seen.has(job.id)) continue;
    seen.add(job.id);
    unique.push(job);
  }

  return unique;
}

function findJob(
  data: InfiniteData<JobListResponse> | undefined,
  jobId: string,
): Job | undefined {
  return data?.pages.flatMap((page) => page.jobs).find((job) => job.id === jobId);
}

function adjustStats(
  stats: JobStats,
  previousApplied: boolean,
  nextApplied: boolean,
): JobStats {
  if (previousApplied === nextApplied) return stats;

  const delta = nextApplied ? 1 : -1;
  return {
    ...stats,
    total: stats.total,
    applied: Math.max(0, stats.applied + delta),
    remaining: Math.max(0, stats.remaining - delta),
    saved: stats.saved ?? 0,
    flagged: stats.flagged ?? 0,
  };
}

function adjustSavedStats(
  stats: JobStats,
  previousSaved: boolean,
  nextSaved: boolean,
): JobStats {
  if (previousSaved === nextSaved) return stats;

  const delta = nextSaved ? 1 : -1;
  return {
    ...stats,
    // Saving hides from the main list total when not on the saved tab.
    total: Math.max(0, stats.total + (nextSaved ? -1 : 1)),
    remaining: Math.max(0, stats.remaining + (nextSaved ? -1 : 1)),
    saved: Math.max(0, (stats.saved ?? 0) + delta),
  };
}

function adjustFlaggedStats(
  stats: JobStats,
  previousFlagged: boolean,
  nextFlagged: boolean,
): JobStats {
  if (previousFlagged === nextFlagged) return stats;

  const delta = nextFlagged ? 1 : -1;
  return {
    ...stats,
    // Flagging hides from the main list total when not on the flagged tab.
    total: Math.max(0, stats.total + (nextFlagged ? -1 : 1)),
    remaining: Math.max(0, stats.remaining + (nextFlagged ? -1 : 1)),
    flagged: Math.max(0, (stats.flagged ?? 0) + delta),
  };
}

function shouldKeepJob(
  filter: AppliedFilter,
  applied: boolean,
  saved?: boolean,
  flagged?: boolean,
): boolean {
  if (filter === "flagged") return Boolean(flagged);
  if (filter === "saved") return Boolean(saved) && !flagged;
  // Main lists (all / applied / not_applied) hide saved and flagged jobs.
  if (saved || flagged) return false;
  if (filter === "applied") return applied;
  if (filter === "not_applied") return !applied;
  return true;
}

function appliedFilterFromQueryKey(key: QueryKey): AppliedFilter {
  const filters = key[1] as { appliedFilter?: AppliedFilter } | undefined;
  return filters?.appliedFilter ?? "all";
}

const EMPTY_STATS: JobStats = {
  total: 0,
  applied: 0,
  remaining: 0,
  saved: 0,
  flagged: 0,
};

function patchJobsCache(
  data: InfiniteData<JobListResponse> | undefined,
  filter: AppliedFilter,
  jobId: string,
  nextApplied: boolean,
  previousApplied?: boolean,
): InfiniteData<JobListResponse> | undefined {
  if (!data) return data;

  const existing = findJob(data, jobId);
  const fromApplied = existing?.applied ?? previousApplied;

  if (fromApplied === undefined || fromApplied === nextApplied) {
    return data;
  }

  const keep = shouldKeepJob(
    filter,
    nextApplied,
    existing?.saved,
    existing?.flagged,
  );
  const nextStats = adjustStats(
    data.pages[0]?.stats ?? EMPTY_STATS,
    fromApplied,
    nextApplied,
  );

  const pages = data.pages.map((page) => {
    const hadJob = page.jobs.some((job) => job.id === jobId);
    let jobs = page.jobs.map((job) =>
      job.id === jobId
        ? {
            ...job,
            applied: nextApplied,
            applied_at: nextApplied ? new Date().toISOString() : null,
          }
        : job,
    );

    if (hadJob && !keep) {
      jobs = jobs.filter((job) => job.id !== jobId);
    }

    const removed = hadJob && !keep ? 1 : 0;

    return {
      ...page,
      jobs,
      total: Math.max(0, page.total - removed),
      stats: nextStats,
    };
  });

  return { ...data, pages };
}

function patchSavedCache(
  data: InfiniteData<JobListResponse> | undefined,
  filter: AppliedFilter,
  jobId: string,
  nextSaved: boolean,
  previousSaved?: boolean,
): InfiniteData<JobListResponse> | undefined {
  if (!data) return data;

  const existing = findJob(data, jobId);
  const fromSaved = existing?.saved ?? previousSaved;

  if (fromSaved === undefined || fromSaved === nextSaved) {
    return data;
  }

  const keep = shouldKeepJob(
    filter,
    existing?.applied ?? false,
    nextSaved,
    existing?.flagged,
  );
  const nextStats = adjustSavedStats(
    data.pages[0]?.stats ?? EMPTY_STATS,
    fromSaved,
    nextSaved,
  );

  const pages = data.pages.map((page) => {
    const hadJob = page.jobs.some((job) => job.id === jobId);
    let jobs = page.jobs.map((job) =>
      job.id === jobId
        ? {
            ...job,
            saved: nextSaved,
            saved_at: nextSaved ? new Date().toISOString() : null,
          }
        : job,
    );

    if (hadJob && !keep) {
      jobs = jobs.filter((job) => job.id !== jobId);
    }

    const removed = hadJob && !keep ? 1 : 0;

    return {
      ...page,
      jobs,
      total: Math.max(0, page.total - removed),
      stats: nextStats,
    };
  });

  return { ...data, pages };
}

function patchFlaggedCache(
  data: InfiniteData<JobListResponse> | undefined,
  filter: AppliedFilter,
  jobId: string,
  nextFlagged: boolean,
  previousFlagged?: boolean,
): InfiniteData<JobListResponse> | undefined {
  if (!data) return data;

  const existing = findJob(data, jobId);
  const fromFlagged = existing?.flagged ?? previousFlagged;

  if (fromFlagged === undefined || fromFlagged === nextFlagged) {
    return data;
  }

  const keep = shouldKeepJob(
    filter,
    existing?.applied ?? false,
    existing?.saved,
    nextFlagged,
  );
  const nextStats = adjustFlaggedStats(
    data.pages[0]?.stats ?? EMPTY_STATS,
    fromFlagged,
    nextFlagged,
  );

  const pages = data.pages.map((page) => {
    const hadJob = page.jobs.some((job) => job.id === jobId);
    let jobs = page.jobs.map((job) =>
      job.id === jobId
        ? {
            ...job,
            flagged: nextFlagged,
            flagged_at: nextFlagged ? new Date().toISOString() : null,
          }
        : job,
    );

    if (hadJob && !keep) {
      jobs = jobs.filter((job) => job.id !== jobId);
    }

    const removed = hadJob && !keep ? 1 : 0;

    return {
      ...page,
      jobs,
      total: Math.max(0, page.total - removed),
      stats: nextStats,
    };
  });

  return { ...data, pages };
}

export function JobList() {
  const queryClient = useQueryClient();
  const [appliedFilter, setAppliedFilter] = useState<AppliedFilter>("all");
  const [search, setSearch] = useState<JobSearchFilters>(EMPTY_SEARCH);
  const debouncedCompany = useDebouncedValue(search.company, 300);
  const debouncedSource = useDebouncedValue(search.source, 300);

  const [resumeId, setResumeId] = useState<string | null>(null);
  const [resumeFilename, setResumeFilename] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [matchByJob, setMatchByJob] = useState<Record<string, number>>({});
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelJob, setPanelJob] = useState<Job | null>(null);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [panelAnalysis, setPanelAnalysis] = useState<AnalysisResult | null>(
    null,
  );
  const [panelRefreshing, setPanelRefreshing] = useState(false);
  const [analyzingJobId, setAnalyzingJobId] = useState<string | null>(null);
  const [batchAnalyzing, setBatchAnalyzing] = useState(false);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [batchResults, setBatchResults] = useState<BatchJobResult[]>([]);
  const [batchSort, setBatchSort] = useState<BatchSort>("match");

  useEffect(() => {
    const stored = loadStoredResume();
    if (stored) {
      setResumeId(stored.resumeId);
      setResumeFilename(stored.filename);
    }
  }, []);

  const queryFilters = useMemo(
    () => ({
      appliedFilter,
      company: debouncedCompany.trim(),
      source: debouncedSource.trim(),
      maxAge: search.maxAge,
      resumeId: resumeId ?? "",
    }),
    [appliedFilter, debouncedCompany, debouncedSource, search.maxAge, resumeId],
  );

  const hasSearch =
    Boolean(queryFilters.company) ||
    Boolean(queryFilters.source) ||
    Boolean(queryFilters.maxAge);

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey: ["jobs", queryFilters],
    queryFn: ({ pageParam }) =>
      fetchJobs({
        limit: DEFAULT_PAGE_SIZE,
        offset: pageParam,
        appliedFilter: queryFilters.appliedFilter,
        company: queryFilters.company,
        source: queryFilters.source,
        maxAge: queryFilters.maxAge,
        resumeId: queryFilters.resumeId,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      if (!lastPage.has_more) return undefined;
      return lastPageParam + DEFAULT_PAGE_SIZE;
    },
  });

  const toggleAppliedMutation = useMutation({
    mutationFn: ({
      jobId,
      applied,
    }: {
      jobId: string;
      applied: boolean;
      previousApplied: boolean;
    }) => setJobApplied(jobId, applied),
    onMutate: async ({ jobId, applied, previousApplied }) => {
      await queryClient.cancelQueries({ queryKey: ["jobs"] });

      const previous = queryClient.getQueriesData<
        InfiniteData<JobListResponse>
      >({ queryKey: ["jobs"] });

      for (const [key] of previous) {
        const filter = appliedFilterFromQueryKey(key);
        queryClient.setQueryData<InfiniteData<JobListResponse>>(key, (current) =>
          patchJobsCache(current, filter, jobId, applied, previousApplied),
        );
      }

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (!context?.previous) return;
      for (const [key, value] of context.previous) {
        queryClient.setQueryData(key as QueryKey, value);
      }
    },
  });

  const toggleSavedMutation = useMutation({
    mutationFn: ({
      jobId,
      saved,
    }: {
      jobId: string;
      saved: boolean;
      previousSaved: boolean;
    }) => setJobSaved(jobId, saved),
    onMutate: async ({ jobId, saved, previousSaved }) => {
      await queryClient.cancelQueries({ queryKey: ["jobs"] });

      const previous = queryClient.getQueriesData<
        InfiniteData<JobListResponse>
      >({ queryKey: ["jobs"] });

      for (const [key] of previous) {
        const filter = appliedFilterFromQueryKey(key);
        queryClient.setQueryData<InfiniteData<JobListResponse>>(key, (current) =>
          patchSavedCache(current, filter, jobId, saved, previousSaved),
        );
      }

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (!context?.previous) return;
      for (const [key, value] of context.previous) {
        queryClient.setQueryData(key as QueryKey, value);
      }
    },
  });

  const toggleFlaggedMutation = useMutation({
    mutationFn: ({
      jobId,
      flagged,
    }: {
      jobId: string;
      flagged: boolean;
      previousFlagged: boolean;
    }) => setJobFlagged(jobId, flagged),
    onMutate: async ({ jobId, flagged, previousFlagged }) => {
      await queryClient.cancelQueries({ queryKey: ["jobs"] });

      const previous = queryClient.getQueriesData<
        InfiniteData<JobListResponse>
      >({ queryKey: ["jobs"] });

      for (const [key] of previous) {
        const filter = appliedFilterFromQueryKey(key);
        queryClient.setQueryData<InfiniteData<JobListResponse>>(key, (current) =>
          patchFlaggedCache(current, filter, jobId, flagged, previousFlagged),
        );
      }

      if (flagged) {
        setSelectedIds((prev) => {
          if (!prev.has(jobId)) return prev;
          const next = new Set(prev);
          next.delete(jobId);
          return next;
        });
      }

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (!context?.previous) return;
      for (const [key, value] of context.previous) {
        queryClient.setQueryData(key as QueryKey, value);
      }
    },
  });

  const jobs = useMemo(() => {
    const flat = data?.pages.flatMap((page) => page.jobs) ?? [];
    return resolveCompanyNames(dedupeJobs(flat));
  }, [data]);

  // Keep the list topped up when jobs drop off (e.g. apply/flag) or a page is thin.
  useEffect(() => {
    if (jobs.length >= 5) return;
    if (!hasNextPage || isFetchingNextPage || isLoading) return;
    void fetchNextPage();
  }, [
    jobs.length,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    fetchNextPage,
  ]);

  // Seed badges from persisted match_score; keep fresher in-session overrides.
  useEffect(() => {
    if (!jobs.length) return;
    setMatchByJob((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const job of jobs) {
        if (job.match_score == null) continue;
        if (next[job.id] === undefined) {
          next[job.id] = job.match_score;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [jobs]);

  const stats = data?.pages[0]?.stats ?? EMPTY_STATS;
  const filteredTotal = data?.pages[0]?.total ?? 0;

  async function handleToggleApplied(jobId: string, applied: boolean) {
    const current = findJob(data, jobId);
    await toggleAppliedMutation.mutateAsync({
      jobId,
      applied,
      previousApplied: current?.applied ?? !applied,
    });
  }

  async function handleToggleSaved(jobId: string, saved: boolean) {
    const current = findJob(data, jobId);
    await toggleSavedMutation.mutateAsync({
      jobId,
      saved,
      previousSaved: current?.saved ?? !saved,
    });
  }

  async function handleToggleFlagged(jobId: string, flagged: boolean) {
    const current = findJob(data, jobId);
    await toggleFlaggedMutation.mutateAsync({
      jobId,
      flagged,
      previousFlagged: current?.flagged ?? !flagged,
    });
  }

  function handleSelectChange(jobId: string, selected: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(jobId);
      else next.delete(jobId);
      return next;
    });
  }

  async function runSingleAnalyze(job: Job, refresh = false) {
    if (!resumeId) return;
    setPanelJob(job);
    setPanelOpen(true);
    setPanelError(null);
    if (!refresh) setPanelAnalysis(null);
    setAnalyzingJobId(job.id);
    if (refresh) setPanelRefreshing(true);
    else setPanelLoading(true);

    try {
      const result = await analyzeJobResume(job.id, resumeId, refresh);
      setPanelAnalysis(result);
      setMatchByJob((prev) => ({ ...prev, [job.id]: result.overall_match }));
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setPanelLoading(false);
      setPanelRefreshing(false);
      setAnalyzingJobId(null);
    }
  }

  async function runBatch(jobIds: string[]) {
    if (!resumeId || jobIds.length === 0 || batchAnalyzing) return;

    const targets = jobs.filter((j) => jobIds.includes(j.id));
    const byId = new Map(targets.map((j) => [j.id, j]));

    setBatchAnalyzing(true);
    setBatchProgress({
      completed: 0,
      failed: 0,
      remaining: jobIds.length,
      total: jobIds.length,
      message: `Analyzing 0 / ${jobIds.length} jobs...`,
    });
    setBatchResults(
      jobIds.map((id) => {
        const job = byId.get(id);
        return {
          jobId: id,
          company: job?.company ?? "—",
          role: job?.role ?? "—",
          status: "pending" as const,
        };
      }),
    );

    try {
      await analyzeJobsBatch(resumeId, jobIds, {
        onProgress: (progress) => setBatchProgress(progress),
        onResult: (jobId, analysis) => {
          setMatchByJob((prev) => ({
            ...prev,
            [jobId]: analysis.overall_match,
          }));
          setBatchResults((prev) =>
            prev.map((row) =>
              row.jobId === jobId
                ? {
                    ...row,
                    status: "completed",
                    overall_match: analysis.overall_match,
                    summary: analysis.summary,
                    company: analysis.company ?? row.company,
                    role: analysis.role ?? row.role,
                    analysis,
                  }
                : row,
            ),
          );
        },
        onError: (jobId, errorMessage) => {
          setBatchResults((prev) =>
            prev.map((row) =>
              row.jobId === jobId
                ? { ...row, status: "failed", error: errorMessage }
                : row,
            ),
          );
        },
        onDone: (progress) => setBatchProgress(progress),
      });
    } catch (err) {
      setBatchProgress((prev) =>
        prev
          ? {
              ...prev,
              message:
                err instanceof Error ? err.message : "Batch analysis failed",
            }
          : prev,
      );
    } finally {
      setBatchAnalyzing(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <ResumeUploadBar
          resumeId={resumeId}
          filename={resumeFilename}
          onUploaded={(id, name) => {
            setResumeId(id);
            setResumeFilename(name);
          }}
          onCleared={() => {
            setResumeId(null);
            setResumeFilename(null);
          }}
        />
        <JobSearchBar value={search} onChange={setSearch} />
        <JobListSkeleton />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col gap-6">
        <ResumeUploadBar
          resumeId={resumeId}
          filename={resumeFilename}
          onUploaded={(id, name) => {
            setResumeId(id);
            setResumeFilename(name);
          }}
          onCleared={() => {
            setResumeId(null);
            setResumeFilename(null);
          }}
        />
        <JobSearchBar value={search} onChange={setSearch} />
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
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <JobStatsBar stats={stats} />

      <ResumeUploadBar
        resumeId={resumeId}
        filename={resumeFilename}
        onUploaded={(id, name) => {
          setResumeId(id);
          setResumeFilename(name);
        }}
        onCleared={() => {
          setResumeId(null);
          setResumeFilename(null);
        }}
      />

      <JobSearchBar value={search} onChange={setSearch} />

      <AnalyzeToolbar
        selectedCount={selectedIds.size}
        hasResume={Boolean(resumeId)}
        analyzing={batchAnalyzing}
        onSelectAllVisible={() =>
          setSelectedIds(new Set(jobs.map((job) => job.id)))
        }
        onClearSelection={() => setSelectedIds(new Set())}
        onAnalyzeSelected={() => {
          void runBatch([...selectedIds]);
        }}
        onAnalyzeFirstN={(n) => {
          void runBatch(jobs.slice(0, n).map((job) => job.id));
        }}
      />

      <BatchResults
        progress={batchProgress}
        results={batchResults}
        sort={batchSort}
        onSortChange={setBatchSort}
        analyzing={batchAnalyzing}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <AppliedFilterBar
          value={appliedFilter}
          onChange={setAppliedFilter}
        />
        <p className="text-sm text-slate-500">
          {filteredTotal === 0
            ? "No matching roles"
            : jobs.length === 1
              ? "Showing 1 role"
              : `Showing ${formatCount(jobs.length)} of ${formatCount(filteredTotal)} roles`}
          {isFetching && !isFetchingNextPage ? " · Refreshing…" : ""}
        </p>
      </div>

      {jobs.length === 0 ? (
        <EmptyState
          message={
            hasSearch
              ? "No jobs match your search. Try a different company, source, or age."
              : appliedFilter === "applied"
                ? "No applied jobs yet. Click Apply on a role to track it here."
                : appliedFilter === "saved"
                  ? "No saved jobs yet. Click Save on a role to bookmark it here."
                  : appliedFilter === "flagged"
                    ? "No flagged jobs. Flag a role to hide it from the main list."
                    : appliedFilter === "not_applied"
                      ? "No unapplied jobs match the current filters."
                      : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              onToggleApplied={handleToggleApplied}
              onToggleSaved={handleToggleSaved}
              onToggleFlagged={handleToggleFlagged}
              selected={selectedIds.has(job.id)}
              onSelectChange={handleSelectChange}
              matchScore={matchByJob[job.id] ?? job.match_score ?? null}
              canAnalyze={Boolean(resumeId)}
              analyzing={analyzingJobId === job.id}
              onAnalyze={(j) => {
                void runSingleAnalyze(j);
              }}
            />
          ))}

          <div className="flex justify-center pt-2">
            {hasNextPage ? (
              <Button
                type="button"
                size="lg"
                variant="outline"
                disabled={isFetchingNextPage}
                onClick={() => {
                  void fetchNextPage();
                }}
                className="min-w-40"
              >
                {isFetchingNextPage ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Loading…
                  </>
                ) : (
                  "Load More"
                )}
              </Button>
            ) : (
              <p className="text-sm text-slate-400">You&apos;ve reached the end</p>
            )}
          </div>
        </div>
      )}

      <AnalysisPanel
        open={panelOpen}
        loading={panelLoading}
        error={panelError}
        analysis={panelAnalysis}
        company={panelJob?.company}
        role={panelJob?.role}
        refreshing={panelRefreshing}
        onClose={() => setPanelOpen(false)}
        onRefresh={
          panelJob
            ? () => {
                void runSingleAnalyze(panelJob, true);
              }
            : undefined
        }
      />
    </div>
  );
}
