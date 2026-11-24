export interface LinkedInContact {
  id: string;
  name: string;
  company: string;
  role: string;
  why: string;
  importance: number;
  reached_out: boolean;
  responded: boolean;
  followed_up: boolean;
  followed_up_manual: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReachoutStats {
  total: number;
  reached_out: number;
  responded: number;
  needs_follow_up: number;
}

export interface ContactListResponse {
  contacts: LinkedInContact[];
  total: number;
  has_more: boolean;
  stats: ReachoutStats;
}

export interface CompanyListResponse {
  companies: string[];
}

export type ReachoutStatus =
  | "all"
  | "reached_out"
  | "awaiting_reply"
  | "needs_follow_up"
  | "responded";

export type ReachoutSort = "importance" | "name" | "company";

export interface ContactCreate {
  name: string;
  company: string;
  role: string;
  why: string;
  importance: number;
}

export interface ContactUpdate {
  reached_out?: boolean;
  responded?: boolean;
  followed_up?: boolean;
  notes?: string;
}
