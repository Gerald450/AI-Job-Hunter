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
  created_at: string;
  updated_at: string;
}
