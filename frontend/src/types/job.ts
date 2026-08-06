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
  sponsorship_available: boolean | null;
  sponsorship_match: string | null;
  sponsorship_confidence: number;
  created_at: string;
  updated_at: string;
}

export interface JobStats {
  total: number;
  applied: number;
  remaining: number;
}

export interface JobListResponse {
  jobs: Job[];
  total: number;
  has_more: boolean;
  stats: JobStats;
}

export type AppliedFilter = "all" | "not_applied" | "applied";

export interface JobSearchFilters {
  company: string;
  source: string;
  maxAge: string;
}
