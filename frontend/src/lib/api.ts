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
}

function appliedQueryValue(filter: AppliedFilter | undefined): string | null {
  if (filter === "applied") return "true";
  if (filter === "not_applied") return "false";
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
  } = params;

  const search = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  const applied = appliedQueryValue(appliedFilter);
  if (applied !== null) {
    search.set("applied", applied);
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

export { DEFAULT_PAGE_SIZE, API_BASE_URL };
