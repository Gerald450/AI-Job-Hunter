export interface Job {
  id: string;
  company: string;
  role: string;
  location: string;
  apply_url: string | null;
  age: string;
  source: string;
  ats_source: string;
  faang: boolean;
  no_sponsorship: boolean;
  citizenship_required: boolean;
  advanced_degree: boolean;
  closed: boolean;
  applied: boolean;
  applied_at?: string | null;
  saved: boolean;
  saved_at?: string | null;
  flagged: boolean;
  flagged_at?: string | null;
  /** Minimum years required from JD when detected. */
  min_years_required?: number | null;
  sponsorship_available: boolean | null;
  sponsorship_match: string | null;
  sponsorship_confidence: number;
  created_at: string;
  updated_at: string;
  /** Saved resume match score when listed with resumeId. */
  match_score?: number | null;
}

export interface JobStats {
  total: number;
  applied: number;
  remaining: number;
  saved: number;
  flagged: number;
}

export interface JobListResponse {
  jobs: Job[];
  total: number;
  has_more: boolean;
  stats: JobStats;
}

export type AppliedFilter =
  | "all"
  | "not_applied"
  | "applied"
  | "saved"
  | "flagged";

export interface JobSearchFilters {
  company: string;
  source: string;
  maxAge: string;
}
