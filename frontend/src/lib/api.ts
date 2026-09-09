import type {
  AnalysisResult,
  BatchProgress,
  ResumeDetail,
  ResumeUploadResponse,
} from "@/types/analysis";
import type { AppliedFilter, Job, JobListResponse } from "@/types/job";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:8000";

const DEFAULT_PAGE_SIZE = 25;

export interface FetchJobsParams {
  limit?: number;
  offset?: number;
  appliedFilter?: AppliedFilter;
  company?: string;
  source?: string;
  maxAge?: string;
  resumeId?: string;
}

function appliedQueryValue(filter: AppliedFilter | undefined): string | null {
  if (filter === "applied") return "true";
  if (filter === "not_applied") return "false";
  return null;
}

function savedQueryValue(filter: AppliedFilter | undefined): string | null {
  if (filter === "saved") return "true";
  return null;
}

function flaggedQueryValue(filter: AppliedFilter | undefined): string | null {
  if (filter === "flagged") return "true";
  return null;
}

export async function fetchJobs(
  params: FetchJobsParams = {},
): Promise<JobListResponse> {
  const {
    limit = DEFAULT_PAGE_SIZE,
    offset = 0,
    appliedFilter = "all",
    company = "",
    source = "",
    maxAge = "",
    resumeId = "",
  } = params;

  const search = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  const applied = appliedQueryValue(appliedFilter);
  if (applied !== null) {
    search.set("applied", applied);
  }

  const saved = savedQueryValue(appliedFilter);
  if (saved !== null) {
    search.set("saved", saved);
  }

  const flagged = flaggedQueryValue(appliedFilter);
  if (flagged !== null) {
    search.set("flagged", flagged);
  }

  const companyQuery = company.trim();
  if (companyQuery) {
    search.set("company", companyQuery);
  }

  const sourceQuery = source.trim();
  if (sourceQuery) {
    search.set("source", sourceQuery);
  }

  const maxAgeQuery = maxAge.trim();
  if (maxAgeQuery) {
    search.set("max_age", maxAgeQuery);
  }

  const resumeQuery = resumeId.trim();
  if (resumeQuery) {
    search.set("resumeId", resumeQuery);
  }

  const path =
    appliedFilter === "flagged"
      ? `${API_BASE_URL}/api/jobs/flagged?${search.toString()}`
      : `${API_BASE_URL}/api/jobs?${search.toString()}`;

  const response = await fetch(path, {
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

export async function setJobSaved(
  jobId: string,
  saved: boolean,
): Promise<Job> {
  const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/saved`, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ saved }),
  });

  if (!response.ok) {
    throw new Error(`Failed to update saved status (${response.status})`);
  }

  return response.json();
}

export async function setJobFlagged(
  jobId: string,
  flagged: boolean,
): Promise<Job> {
  const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/flagged`, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ flagged }),
  });

  if (!response.ok) {
    throw new Error(`Failed to update flagged status (${response.status})`);
  }

  return response.json();
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
  } catch {
    // ignore
  }
  return `Request failed (${response.status})`;
}

export async function uploadResume(file: File): Promise<ResumeUploadResponse> {
  const form = new FormData();
  form.append("file", file);

  const response = await fetch(`${API_BASE_URL}/api/resumes`, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    throw new Error(await readErrorDetail(response));
  }

  return response.json();
}

export async function fetchResume(resumeId: string): Promise<ResumeDetail> {
  const response = await fetch(`${API_BASE_URL}/api/resumes/${resumeId}`, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(await readErrorDetail(response));
  }

  return response.json();
}

export async function analyzeJobResume(
  jobId: string,
  resumeId: string,
  refresh = false,
): Promise<AnalysisResult> {
  const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/analyze`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ resumeId, refresh }),
  });

  if (!response.ok) {
    throw new Error(await readErrorDetail(response));
  }

  return response.json();
}

export interface BatchAnalyzeHandlers {
  onProgress?: (progress: BatchProgress) => void;
  onResult?: (jobId: string, analysis: AnalysisResult) => void;
  onError?: (jobId: string, error: string) => void;
  onDone?: (progress: BatchProgress) => void;
}

export async function analyzeJobsBatch(
  resumeId: string,
  jobIds: string[],
  handlers: BatchAnalyzeHandlers = {},
  refresh = false,
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/jobs/analyze/batch`, {
    method: "POST",
    headers: {
      Accept: "text/event-stream",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ resumeId, jobIds, refresh }),
  });

  if (!response.ok) {
    throw new Error(await readErrorDetail(response));
  }

  if (!response.body) {
    throw new Error("Batch analysis returned an empty response body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");

      const lines = chunk.split("\n");
      let event = "message";
      const dataLines: string[] = [];
      for (const line of lines) {
        if (line.startsWith("event:")) {
          event = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trim());
        }
      }
      if (dataLines.length === 0) continue;

      const payload = JSON.parse(dataLines.join("\n")) as Record<string, unknown>;

      if (event === "progress") {
        handlers.onProgress?.(payload as unknown as BatchProgress);
      } else if (event === "result") {
        const jobId = String(payload.jobId ?? "");
        const analysis = payload.analysis as AnalysisResult;
        handlers.onResult?.(jobId, analysis);
      } else if (event === "error") {
        handlers.onError?.(
          String(payload.jobId ?? ""),
          String(payload.error ?? "Analysis failed"),
        );
      } else if (event === "done") {
        handlers.onDone?.(payload as unknown as BatchProgress);
      }
    }
  }
}

export interface FetchConferencesParams {
  limit?: number;
  offset?: number;
  search?: string;
  location?: "default" | "all" | "us" | "virtual";
  eligibility?: string;
  funding?:
    | ""
    | "available"
    | "travel"
    | "scholarship"
    | "waiver"
    | "none"
    | "eligible"
    | "needs_verification";
  topic?: string;
  deadline?: string;
  source?: string;
  saved?: boolean;
  trackingStatus?: string;
  recommended?: boolean;
  includeNotEligible?: boolean;
  includeNonUs?: boolean;
}

function applyConferenceFilters(
  search: URLSearchParams,
  params: FetchConferencesParams,
): void {
  const location = params.location ?? "us";
  if (location === "all") {
    search.set("include_non_us", "true");
  } else if (location === "us" || location === "default") {
    search.set("location_status", "US");
  } else if (location === "virtual") {
    search.set("virtual", "true");
  }

  const eligibility = params.eligibility?.trim();
  if (eligibility) search.set("eligibility", eligibility);

  const funding = params.funding ?? "available";
  if (funding === "available" || funding === "eligible" || funding === "needs_verification") {
    search.set("funding_available", "true");
  }
  if (funding === "none") search.set("funding_available", "false");
  if (funding === "travel") search.set("travel_grant_available", "true");
  if (funding === "scholarship") search.set("scholarship_available", "true");
  if (funding === "waiver") search.set("registration_waiver_available", "true");
  if (funding === "eligible") search.set("funding_eligibility", "ELIGIBLE");
  if (funding === "needs_verification") {
    search.set("funding_eligibility", "NEEDS_VERIFICATION");
  }

  const topic = params.topic?.trim();
  if (topic) search.set("topic", topic);

  const deadline = params.deadline?.trim();
  if (deadline) search.set("deadline", deadline);

  const source = params.source?.trim();
  if (source) search.set("source", source);

  const query = params.search?.trim();
  if (query) search.set("search", query);

  if (params.saved === true) search.set("saved", "true");
  const tracking = params.trackingStatus?.trim();
  if (tracking) search.set("tracking_status", tracking);

  if (params.includeNotEligible) search.set("include_not_eligible", "true");
  if (params.includeNonUs) search.set("include_non_us", "true");
}

export async function fetchConferences(
  params: FetchConferencesParams = {},
): Promise<import("@/types/conference").ConferenceListResponse> {
  const {
    limit = DEFAULT_PAGE_SIZE,
    offset = 0,
    recommended = true,
  } = params;

  const search = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  applyConferenceFilters(search, params);

  const path = recommended
    ? `${API_BASE_URL}/api/conferences/recommended?${search.toString()}`
    : `${API_BASE_URL}/api/conferences?${search.toString()}`;

  const response = await fetch(path, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Failed to load conferences (${response.status})`);
  }
  return response.json();
}

export async function fetchConference(
  id: string,
): Promise<import("@/types/conference").Conference> {
  const response = await fetch(`${API_BASE_URL}/api/conferences/${id}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(await readErrorDetail(response));
  }
  return response.json();
}

export async function fetchConferenceStats(
  params: { includeNonUs?: boolean; includeNotEligible?: boolean } = {},
): Promise<import("@/types/conference").ConferenceStats> {
  const search = new URLSearchParams();
  if (params.includeNonUs) search.set("include_non_us", "true");
  if (params.includeNotEligible) search.set("include_not_eligible", "true");
  const suffix = search.toString() ? `?${search.toString()}` : "";
  const response = await fetch(`${API_BASE_URL}/api/conferences/stats${suffix}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Failed to load conference stats (${response.status})`);
  }
  return response.json();
}

export async function fetchConferenceDeadlines(
  limit = 100,
): Promise<import("@/types/conference").ConferenceDeadlineListResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/conferences/deadlines?limit=${limit}`,
    { headers: { Accept: "application/json" } },
  );
  if (!response.ok) {
    throw new Error(`Failed to load deadlines (${response.status})`);
  }
  return response.json();
}

export async function fetchConferenceFunding(
  limit = 100,
): Promise<import("@/types/conference").ConferenceFundingListResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/conferences/funding?limit=${limit}`,
    { headers: { Accept: "application/json" } },
  );
  if (!response.ok) {
    throw new Error(`Failed to load funding (${response.status})`);
  }
  return response.json();
}

export async function setConferenceSaved(
  conferenceId: string,
  saved: boolean,
): Promise<import("@/types/conference").Conference> {
  const response = await fetch(
    `${API_BASE_URL}/api/conferences/${conferenceId}/saved`,
    {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ saved }),
    },
  );
  if (!response.ok) {
    throw new Error(`Failed to update saved status (${response.status})`);
  }
  return response.json();
}

export async function setConferenceTracking(
  conferenceId: string,
  status: string | null,
): Promise<import("@/types/conference").Conference> {
  const response = await fetch(
    `${API_BASE_URL}/api/conferences/${conferenceId}/tracking`,
    {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status }),
    },
  );
  if (!response.ok) {
    throw new Error(`Failed to update tracking status (${response.status})`);
  }
  return response.json();
}

export { DEFAULT_PAGE_SIZE, API_BASE_URL };
