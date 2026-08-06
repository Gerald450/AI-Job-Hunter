import type { AppliedFilter, Job, JobListResponse } from "@/types/job";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:8000";

const DEFAULT_PAGE_SIZE = 25;

export interface FetchJobsParams {
  limit?: number;
  offset?: number;
  appliedFilter?: AppliedFilter;
}

function appliedQueryValue(filter: AppliedFilter | undefined): string | null {
  if (filter === "applied") return "true";
  if (filter === "not_applied") return "false";
  return null;
}

export async function fetchJobs(
  params: FetchJobsParams = {},
): Promise<JobListResponse> {
  const { limit = DEFAULT_PAGE_SIZE, offset = 0, appliedFilter = "all" } = params;

  const search = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  const applied = appliedQueryValue(appliedFilter);
  if (applied !== null) {
    search.set("applied", applied);
  }

  const response = await fetch(`${API_BASE_URL}/api/jobs?${search.toString()}`, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Failed to load jobs (${response.status})`);
  }

  return response.json();
}

export async function setJobApplied(
  jobId: string,
  applied: boolean,
): Promise<Job> {
  const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/applied`, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ applied }),
  });

  if (!response.ok) {
    throw new Error(`Failed to update applied status (${response.status})`);
  }

  return response.json();
}

export { DEFAULT_PAGE_SIZE };
