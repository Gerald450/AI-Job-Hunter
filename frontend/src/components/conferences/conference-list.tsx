"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryKey,
} from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ConferenceCard } from "@/components/conferences/conference-card";
import {
  ConferenceFilters,
  EMPTY_CONFERENCE_FILTERS,
} from "@/components/conferences/conference-filters";
import { ConferenceListSkeleton } from "@/components/conferences/conference-skeleton";
import { ConferenceStatsBar } from "@/components/conferences/conference-stats";
import { UpcomingDeadlines } from "@/components/conferences/upcoming-deadlines";
import { EmptyState } from "@/components/jobs/empty-state";
import { ErrorState } from "@/components/jobs/error-state";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_PAGE_SIZE,
  fetchConferenceStats,
  fetchConferences,
  setConferenceSaved,
  setConferenceTracking,
} from "@/lib/api";
import { hasStudentFunding, isPastConference, safeConference } from "@/lib/conferences";
import type {
  Conference,
  ConferenceListResponse,
  ConferenceSearchFilters,
} from "@/types/conference";

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

function patchConferenceCache(
  data: InfiniteData<ConferenceListResponse> | undefined,
  conferenceId: string,
  patch: Partial<Conference>,
): InfiniteData<ConferenceListResponse> | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      conferences: page.conferences.map((conference) =>
        conference.id === conferenceId ? { ...conference, ...patch } : conference,
      ),
    })),
  };
}

export function ConferenceList() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<ConferenceSearchFilters>(
    EMPTY_CONFERENCE_FILTERS,
  );
  const debouncedSearch = useDebouncedValue(filters.search, 300);

  const queryFilters = useMemo(
    () => ({
      ...filters,
      search: debouncedSearch.trim(),
    }),
    [filters, debouncedSearch],
  );

  const statsQuery = useQuery({
    queryKey: ["conference-stats", queryFilters.location],
    queryFn: () =>
      fetchConferenceStats({
        includeNonUs: queryFilters.location === "all",
      }),
  });

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
    queryKey: ["conferences", queryFilters],
    queryFn: ({ pageParam }) =>
      fetchConferences({
        limit: DEFAULT_PAGE_SIZE,
        offset: pageParam,
        recommended: true,
        search: queryFilters.search,
        location: queryFilters.location,
        eligibility: queryFilters.eligibility,
        funding: queryFilters.funding,
        topic: queryFilters.topic,
        deadline: queryFilters.deadline,
        source: queryFilters.source,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      if (!lastPage.has_more) return undefined;
      return lastPageParam + DEFAULT_PAGE_SIZE;
    },
  });

  const savedMutation = useMutation({
    mutationFn: ({
      conferenceId,
      saved,
    }: {
      conferenceId: string;
      saved: boolean;
    }) => setConferenceSaved(conferenceId, saved),
    onMutate: async ({ conferenceId, saved }) => {
      await queryClient.cancelQueries({ queryKey: ["conferences"] });
      const previous = queryClient.getQueriesData<
        InfiniteData<ConferenceListResponse>
      >({ queryKey: ["conferences"] });
      for (const [key] of previous) {
        queryClient.setQueryData<InfiniteData<ConferenceListResponse>>(
          key,
          (current) =>
            patchConferenceCache(current, conferenceId, {
              saved,
              saved_at: saved ? new Date().toISOString() : null,
            }),
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

  const trackingMutation = useMutation({
    mutationFn: ({
      conferenceId,
      status,
    }: {
      conferenceId: string;
      status: string | null;
    }) => setConferenceTracking(conferenceId, status),
    onMutate: async ({ conferenceId, status }) => {
      await queryClient.cancelQueries({ queryKey: ["conferences"] });
      const previous = queryClient.getQueriesData<
        InfiniteData<ConferenceListResponse>
      >({ queryKey: ["conferences"] });
      for (const [key] of previous) {
        queryClient.setQueryData<InfiniteData<ConferenceListResponse>>(
          key,
          (current) =>
            patchConferenceCache(current, conferenceId, {
              tracking_status: status,
              tracking_updated_at: status ? new Date().toISOString() : null,
            }),
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

  const conferences = useMemo(() => {
    const flat = data?.pages.flatMap((page) => page.conferences) ?? [];
    const unique: Conference[] = [];
    const seen = new Set<string>();
    for (const item of flat) {
      const conference = safeConference(item);
      if (!conference || seen.has(conference.id)) continue;
      if (conference.eligibility_status === "NOT_ELIGIBLE") continue;
      if (conference.is_virtual || conference.location_status === "VIRTUAL") {
        continue;
      }
      if (!hasStudentFunding(conference)) continue;
      if (isPastConference(conference)) continue;
      if (
        queryFilters.location !== "all" &&
        conference.location_status === "NON_US"
      ) {
        continue;
      }
      seen.add(conference.id);
      unique.push(conference);
    }
    return unique;
  }, [data, queryFilters.location]);

  const filteredTotal = data?.pages[0]?.total ?? 0;
  const fundingHeading =
    queryFilters.funding === "eligible"
      ? "Conferences You Can Get Funding For"
      : queryFilters.funding === "needs_verification"
        ? "Funding Needs Verification"
        : queryFilters.funding === "available"
          ? "Conferences with student funding"
          : null;

  async function handleToggleSaved(id: string, saved: boolean) {
    await savedMutation.mutateAsync({ conferenceId: id, saved });
  }

  async function handleTrackingChange(id: string, status: string | null) {
    await trackingMutation.mutateAsync({ conferenceId: id, status });
  }

  return (
    <div className="flex flex-col gap-6">
      {statsQuery.data ? <ConferenceStatsBar stats={statsQuery.data} /> : null}

      <UpcomingDeadlines />

      <ConferenceFilters value={filters} onChange={setFilters} />

      {fundingHeading ? (
        <h2 className="text-lg font-semibold text-slate-900">{fundingHeading}</h2>
      ) : null}

      {isLoading ? <ConferenceListSkeleton /> : null}

      {isError ? (
        <ErrorState
          message={
            error instanceof Error
              ? error.message
              : "Unable to load conferences. Try again."
          }
          onRetry={() => {
            void refetch();
          }}
        />
      ) : null}

      {!isLoading && !isError && conferences.length === 0 ? (
        <EmptyState message="No conferences currently match your eligibility criteria.">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setFilters({
                ...EMPTY_CONFERENCE_FILTERS,
                eligibility: "NEEDS_VERIFICATION",
              })
            }
          >
            View conferences needing verification
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setFilters({ ...filters, location: "all", topic: "" })
            }
          >
            Include all in-person locations
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setFilters({ ...filters, topic: "" })}
          >
            Expand your topic filters
          </Button>
        </EmptyState>
      ) : null}

      {!isLoading && !isError && conferences.length > 0 ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-500">
            Showing {conferences.length.toLocaleString("en-US")} of{" "}
            {filteredTotal.toLocaleString("en-US")} conferences
            {isFetching && !isFetchingNextPage ? " · Refreshing…" : ""}
          </p>
          {conferences.map((conference) => (
            <ConferenceCard
              key={conference.id}
              conference={conference}
              onToggleSaved={handleToggleSaved}
              onTrackingChange={handleTrackingChange}
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
      ) : null}
    </div>
  );
}
