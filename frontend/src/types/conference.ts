export type EligibilityStatus =
  | "ELIGIBLE"
  | "LIKELY_ELIGIBLE"
  | "NEEDS_VERIFICATION"
  | "NOT_ELIGIBLE"
  | string;

export type TrackingStatus =
  | "interested"
  | "funding_application"
  | "applied"
  | "registered"
  | "attended";

export interface MatchReason {
  factor: string;
  points: number;
  why: string;
}

export interface ConferenceSource {
  source: string;
  source_url?: string | null;
}

export interface ConferenceDeadline {
  kind: string;
  deadline_at?: string | null;
  is_rolling?: boolean;
  is_unknown?: boolean;
  source_url?: string | null;
  days_until_deadline?: number | null;
  expired?: boolean;
  closing_soon?: boolean;
  conference_id?: string;
  conference_name?: string;
}

export interface ConferenceFunding {
  name: string;
  kind: string;
  amount?: string | null;
  deadline?: string | null;
  application_url?: string | null;
  requirements_text?: string | null;
  undergraduate_eligible?: boolean | null;
  paper_required?: boolean | null;
  citizenship_requirements?: string | null;
  eligibility_status: string;
  source_url?: string | null;
  conference_id?: string;
  conference_name?: string;
}

export interface Conference {
  id: string;
  name: string;
  organization?: string | null;
  description?: string | null;
  official_url?: string | null;
  source: string;
  source_url?: string | null;
  location?: string | null;
  country?: string | null;
  city?: string | null;
  state?: string | null;
  is_virtual?: boolean;
  location_status?: string;
  start_date?: string | null;
  end_date?: string | null;
  call_for_papers_deadline?: string | null;
  paper_submission_deadline?: string | null;
  abstract_deadline?: string | null;
  registration_deadline?: string | null;
  student_registration_deadline?: string | null;
  funding_deadline?: string | null;
  application_deadline?: string | null;
  conference_type?: string | null;
  topics?: string[] | null;
  student_eligible?: boolean | null;
  undergraduate_eligible?: boolean | null;
  graduate_eligible?: boolean | null;
  funding_available?: boolean | null;
  travel_grant_available?: boolean | null;
  registration_waiver_available?: boolean | null;
  scholarship_available?: boolean | null;
  funding_amount?: string | null;
  funding_requirements?: string | null;
  citizenship_requirements?: string | null;
  residency_requirements?: string | null;
  eligibility_requirements?: string | null;
  application_url?: string | null;
  status?: string;
  last_verified_at?: string | null;
  eligibility_status: string;
  funding_status?: string | null;
  citizenship_status?: string | null;
  funding_eligibility_status?: string | null;
  match_score?: number | null;
  match_reasons?: MatchReason[] | null;
  sources?: ConferenceSource[] | null;
  funding?: ConferenceFunding[] | null;
  deadlines?: ConferenceDeadline[] | null;
  saved?: boolean;
  saved_at?: string | null;
  tracking_status?: TrackingStatus | string | null;
  tracking_updated_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ConferenceListResponse {
  conferences: Conference[];
  total: number;
  has_more: boolean;
}

export interface ConferenceStats {
  recommended: number;
  with_funding: number;
  travel_grants: number;
  deadlines_this_month: number;
}

export interface ConferenceDeadlineListResponse {
  deadlines: ConferenceDeadline[];
  total: number;
}

export interface ConferenceFundingListResponse {
  funding: ConferenceFunding[];
  total: number;
}

export type ConferenceLocationFilter = "default" | "all" | "us" | "virtual";

export type ConferenceFundingFilter =
  | ""
  | "available"
  | "travel"
  | "scholarship"
  | "waiver"
  | "none"
  | "eligible"
  | "needs_verification";

export interface ConferenceSearchFilters {
  search: string;
  location: ConferenceLocationFilter;
  eligibility: "" | "ELIGIBLE" | "LIKELY_ELIGIBLE" | "NEEDS_VERIFICATION";
  funding: ConferenceFundingFilter;
  topic: string;
  deadline: "" | "closing_soon" | "this_month" | "next_3_months";
  source: string;
}
