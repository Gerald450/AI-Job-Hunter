export interface ResumeUploadResponse {
  resumeId: string;
  filename: string;
  contentType: string;
  size: number;
  parsed?: Record<string, unknown> | null;
}

export interface ResumeDetail {
  resumeId: string;
  filename: string;
  contentType: string;
  size: number;
  parsed: Record<string, unknown>;
  createdAt?: string | null;
}

export interface AnalysisResult {
  id: string;
  jobId: string;
  resumeId: string;
  company?: string | null;
  role?: string | null;
  overall_match: number;
  summary: string;
  strengths: string[];
  missing_skills: string[];
  recommended_improvements: string[];
  matched_keywords: string[];
  missing_keywords: string[];
  confidence: string;
  llm_provider: string;
  cached: boolean;
  created_at?: string | null;
}

export type BatchResultStatus = "completed" | "failed" | "pending";

export interface BatchJobResult {
  jobId: string;
  company: string;
  role: string;
  status: BatchResultStatus;
  overall_match?: number;
  summary?: string;
  error?: string;
  analysis?: AnalysisResult;
}

export interface BatchProgress {
  completed: number;
  failed: number;
  remaining: number;
  total: number;
  message: string;
}

export type BatchSort = "match" | "newest" | "company";
