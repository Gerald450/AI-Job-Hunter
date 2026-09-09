import type { Conference } from "@/types/conference";

export function makeConference(
  overrides: Partial<Conference> = {},
): Conference {
  return {
    id: "conf-1",
    name: "International Conference on Software Engineering",
    organization: "ACM",
    description: "Software engineering research conference.",
    official_url: "https://example.com/icse",
    source: "acm",
    location: "Seattle, WA",
    location_status: "US",
    is_virtual: false,
    start_date: "2027-05-10",
    end_date: "2027-05-14",
    topics: ["computer_science", "software_engineering"],
    student_eligible: true,
    undergraduate_eligible: true,
    graduate_eligible: true,
    funding_available: true,
    travel_grant_available: true,
    registration_waiver_available: false,
    scholarship_available: false,
    eligibility_status: "ELIGIBLE",
    funding_status: "FUNDING_AVAILABLE",
    citizenship_status: "ELIGIBLE",
    funding_eligibility_status: "ELIGIBLE",
    match_score: 94,
    match_reasons: [
      { factor: "topic_alignment", points: 25, why: "Computer Science" },
      { factor: "undergraduate_eligible", points: 20, why: "Undergraduate eligibility" },
      { factor: "us_or_virtual", points: 15, why: "U.S. location" },
    ],
    funding: [
      {
        name: "Student Travel Grant",
        kind: "travel_grant",
        amount: "Up to $1,000",
        deadline: "2027-03-15",
        eligibility_status: "ELIGIBLE",
        undergraduate_eligible: true,
        paper_required: false,
      },
    ],
    deadlines: [
      {
        kind: "travel_grant",
        deadline_at: "2027-03-15",
        is_rolling: false,
        days_until_deadline: 21,
        expired: false,
        closing_soon: false,
      },
      {
        kind: "paper",
        deadline_at: "2027-04-01",
        is_rolling: false,
        days_until_deadline: 38,
        expired: false,
        closing_soon: false,
      },
    ],
    saved: false,
    tracking_status: null,
    ...overrides,
  };
}
