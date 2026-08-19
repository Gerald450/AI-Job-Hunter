import type {
  Conference,
  ConferenceDeadline,
  ConferenceFunding,
  EligibilityStatus,
} from "@/types/conference";

export type ReasonTone = "pass" | "unresolved" | "fail";

export interface EligibilityReason {
  tone: ReasonTone;
  label: string;
}

const DEADLINE_KIND_LABELS: Record<string, string> = {
  cfp: "CFP deadline",
  paper: "Paper deadline",
  abstract: "Abstract deadline",
  registration: "Registration deadline",
  student_registration: "Student registration",
  travel_grant: "Travel grant",
  scholarship: "Scholarship deadline",
  application: "Application deadline",
  rolling: "Rolling",
};

const FUNDING_KIND_LABELS: Record<string, string> = {
  travel_grant: "Student Travel Grant",
  registration_waiver: "Registration Waiver",
  scholarship: "Registration Scholarship",
  attendance_grant: "Attendance Grant",
  hotel: "Hotel/accommodation assistance",
  airfare: "Travel reimbursement",
  other: "Student funding",
};

const TOPIC_LABELS: Record<string, string> = {
  computer_science: "Computer Science",
  software_engineering: "Software Engineering",
  artificial_intelligence: "AI/ML",
  machine_learning: "AI/ML",
  mathematics: "Mathematics",
  research: "Research",
  systems: "Systems",
  security: "Security",
  developer_tech: "Developer technologies",
  data_infrastructure: "Data infrastructure",
  programming: "Programming",
};

const TRACKING_LABELS: Record<string, string> = {
  interested: "Interested",
  funding_application: "Funding Application",
  applied: "Applied",
  registered: "Registered",
  attended: "Attended",
};

export const TRACKING_OPTIONS = [
  { value: "interested", label: "Interested" },
  { value: "funding_application", label: "Funding Application" },
  { value: "applied", label: "Applied" },
  { value: "registered", label: "Registered" },
  { value: "attended", label: "Attended" },
] as const;

export function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

export function eligibilityLabel(status: string | null | undefined): string {
  switch (status) {
    case "ELIGIBLE":
      return "Eligible";
    case "LIKELY_ELIGIBLE":
      return "Likely Eligible";
    case "NEEDS_VERIFICATION":
      return "Needs Verification";
    case "NOT_ELIGIBLE":
      return "Not Eligible";
    default:
      return status || "Needs Verification";
  }
}

export function isNeedsVerification(
  status: string | null | undefined,
): boolean {
  return status === "NEEDS_VERIFICATION";
}

export function isEligibleStatus(status: string | null | undefined): boolean {
  return status === "ELIGIBLE";
}

export function topicLabel(topic: string): string {
  const key = topic.trim().toLowerCase().replace(/\s+/g, "_");
  return TOPIC_LABELS[key] || topic;
}

export function deadlineKindLabel(kind: string): string {
  return DEADLINE_KIND_LABELS[kind] || kind.replaceAll("_", " ");
}

export function fundingKindLabel(kind: string): string {
  return FUNDING_KIND_LABELS[kind] || kind.replaceAll("_", " ");
}

export function trackingLabel(status: string | null | undefined): string {
  if (!status) return "";
  return TRACKING_LABELS[status] || status;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const parsed = parseIsoDate(iso);
  if (!parsed) return iso;
  return parsed.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatDateRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  const startDate = parseIsoDate(start);
  const endDate = parseIsoDate(end);
  if (!startDate && !endDate) return "";
  if (startDate && !endDate) return formatDate(start);
  if (!startDate && endDate) return formatDate(end);
  if (!startDate || !endDate) return "";

  const sameYear = startDate.getUTCFullYear() === endDate.getUTCFullYear();
  const sameMonth = sameYear && startDate.getUTCMonth() === endDate.getUTCMonth();
  const startLabel = startDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
    timeZone: "UTC",
  });
  const endLabel = endDate.toLocaleDateString("en-US", {
    month: sameMonth ? undefined : "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${startLabel}–${endLabel}`;
}

export function parseIsoDate(iso: string | null | undefined): Date | null {
  if (!iso || typeof iso !== "string") return null;
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

export function daysUntilDate(
  iso: string | null | undefined,
  today = new Date(),
): number | null {
  const parsed = parseIsoDate(iso);
  if (!parsed) return null;
  const start = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  const end = Date.UTC(
    parsed.getUTCFullYear(),
    parsed.getUTCMonth(),
    parsed.getUTCDate(),
  );
  return Math.round((end - start) / 86_400_000);
}

export function isPastConference(
  conference: Pick<Conference, "start_date" | "end_date">,
  today = new Date(),
): boolean {
  const days = daysUntilDate(conference.end_date || conference.start_date, today);
  return days != null && days < 0;
}

export function conferenceDeadlines(conference: Conference): ConferenceDeadline[] {
  const nested = asArray(conference.deadlines);
  if (nested.length > 0) return nested.filter((item) => item && item.kind);

  const scalars: Array<[string, string | null | undefined]> = [
    ["cfp", conference.call_for_papers_deadline],
    ["paper", conference.paper_submission_deadline],
    ["abstract", conference.abstract_deadline],
    ["registration", conference.registration_deadline],
    ["student_registration", conference.student_registration_deadline],
    ["travel_grant", conference.funding_deadline],
    ["application", conference.application_deadline],
  ];

  return scalars
    .filter(([, value]) => Boolean(value))
    .map(([kind, deadline_at]) => {
      const days = daysUntilDate(deadline_at);
      return {
        kind,
        deadline_at,
        is_rolling: false,
        is_unknown: false,
        days_until_deadline: days,
        expired: days != null ? days < 0 : false,
        closing_soon: days != null ? days >= 0 && days <= 14 : false,
      };
    });
}

export function primaryDeadline(
  conference: Conference,
): ConferenceDeadline | null {
  const items = conferenceDeadlines(conference);
  const dated = items
    .filter((item) => item.deadline_at && item.expired !== true)
    .map((item) => ({
      item,
      days:
        item.days_until_deadline ?? daysUntilDate(item.deadline_at) ?? Number.POSITIVE_INFINITY,
    }))
    .filter((entry) => entry.days >= 0)
    .sort((a, b) => a.days - b.days);
  if (dated[0]) return dated[0].item;
  const rolling = items.find((item) => item.is_rolling);
  return rolling ?? null;
}

export function deadlineStatusText(deadline: ConferenceDeadline): string {
  if (deadline.is_rolling) return "Rolling";
  const days =
    deadline.days_until_deadline ?? daysUntilDate(deadline.deadline_at);
  if (deadline.expired || (days != null && days < 0)) return "Deadline passed";
  if (days == null) return "";
  if (days === 0) return "Due today";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

export function isDeadlineUrgent(deadline: ConferenceDeadline): boolean {
  if (deadline.is_rolling || deadline.expired) return false;
  const days =
    deadline.days_until_deadline ?? daysUntilDate(deadline.deadline_at);
  if (days == null) return Boolean(deadline.closing_soon);
  return days >= 0 && days <= 7;
}

export function locationLine(conference: Conference): string {
  if (conference.is_virtual || conference.location_status === "VIRTUAL") {
    return conference.location ? `Virtual · ${conference.location}` : "Virtual";
  }
  return conference.location?.trim() || "Location unavailable";
}

export function eligibilityReasons(conference: Conference): EligibilityReason[] {
  const reasons: EligibilityReason[] = [];
  if (conference.undergraduate_eligible === true) {
    reasons.push({ tone: "pass", label: "Undergraduate eligible" });
  }
  if (conference.undergraduate_eligible === false) {
    reasons.push({ tone: "fail", label: "Graduate students only" });
  }

  const topics = asArray(conference.topics).map((topic) => topic.toLowerCase());
  if (
    topics.some(
      (topic) =>
        topic.includes("computer_science") || topic.includes("computer science"),
    )
  ) {
    reasons.push({ tone: "pass", label: "Computer Science relevant" });
  }

  if (conference.location_status === "US") {
    reasons.push({ tone: "pass", label: "U.S. conference" });
  }

  if (conference.funding_available === true) {
    reasons.push({ tone: "pass", label: "Student funding available" });
  }

  if (conference.citizenship_status === "NEEDS_VERIFICATION") {
    reasons.push({
      tone: "unresolved",
      label: "Citizenship requirement needs verification",
    });
  }

  const grants = asArray(conference.funding);
  if (grants.some((grant) => grant.paper_required === true)) {
    reasons.push({
      tone: "unresolved",
      label: "Accepted paper required for travel grant",
    });
  }

  return reasons;
}

export function studentFundingRows(
  conference: Conference,
): ConferenceFunding[] {
  return asArray(conference.funding).filter((grant) => grant && grant.name);
}

export function hasTravelGrant(conference: Conference): boolean {
  if (conference.travel_grant_available === true) return true;
  return studentFundingRows(conference).some(
    (grant) => grant.kind === "travel_grant",
  );
}

export function hasStudentFunding(conference: Conference): boolean {
  if (conference.funding_available === true) return true;
  if (conference.travel_grant_available === true) return true;
  if (conference.scholarship_available === true) return true;
  if (conference.registration_waiver_available === true) return true;
  return studentFundingRows(conference).length > 0;
}

export function matchReasons(conference: Conference): Array<{
  factor: string;
  points: number;
  why: string;
}> {
  return asArray(conference.match_reasons).filter(
    (reason) => reason && typeof reason.points === "number",
  );
}

export function safeConference(raw: Partial<Conference> | null | undefined): Conference | null {
  if (!raw || typeof raw !== "object" || !raw.id || !raw.name) return null;
  return {
    ...raw,
    id: String(raw.id),
    name: String(raw.name),
    source: String(raw.source || "unknown"),
    eligibility_status: (raw.eligibility_status ||
      "NEEDS_VERIFICATION") as EligibilityStatus,
    topics: asArray(raw.topics),
    match_reasons: asArray(raw.match_reasons),
    sources: asArray(raw.sources),
    funding: asArray(raw.funding),
    deadlines: asArray(raw.deadlines),
    saved: Boolean(raw.saved),
    match_score: typeof raw.match_score === "number" ? raw.match_score : 0,
  };
}
