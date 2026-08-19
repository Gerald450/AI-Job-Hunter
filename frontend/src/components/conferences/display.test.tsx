import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EligibilityBadge } from "@/components/conferences/eligibility-badge";
import { EligibilityReasons } from "@/components/conferences/eligibility-reasons";
import { FundingBlock } from "@/components/conferences/funding-block";
import { DeadlineList } from "@/components/conferences/deadline-list";
import { eligibilityReasons, isPastConference } from "@/lib/conferences";
import { makeConference } from "@/test/fixtures";

describe("eligibility and funding display", () => {
  it("keeps funding eligibility separate from conference eligibility", () => {
    render(
      <div>
        <EligibilityBadge status="ELIGIBLE" />
        <FundingBlock
          grants={[
            {
              name: "Travel Grant",
              kind: "travel_grant",
              eligibility_status: "NEEDS_VERIFICATION",
              paper_required: true,
            },
          ]}
        />
      </div>,
    );
    const badges = screen.getAllByTestId("eligibility-badge");
    expect(badges[0]).toHaveTextContent("Eligible");
    expect(badges[1]).toHaveTextContent("Needs Verification");
    expect(screen.getByTestId("funding-card")).toHaveTextContent(
      "Accepted paper required",
    );
  });

  it("renders failed and unresolved requirement reasons from API fields", () => {
    const reasons = eligibilityReasons(
      makeConference({
        undergraduate_eligible: false,
        citizenship_status: "NEEDS_VERIFICATION",
        funding: [
          {
            name: "Grant",
            kind: "travel_grant",
            eligibility_status: "NEEDS_VERIFICATION",
            paper_required: true,
          },
        ],
      }),
    );
    render(<EligibilityReasons reasons={reasons} />);
    expect(screen.getByText("Graduate students only")).toBeInTheDocument();
    expect(
      screen.getByText("Citizenship requirement needs verification"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Accepted paper required for travel grant"),
    ).toBeInTheDocument();
  });

  it("renders expired and rolling deadlines separately", () => {
    render(
      <DeadlineList
        deadlines={[
          {
            kind: "cfp",
            deadline_at: "2020-01-01",
            expired: true,
            days_until_deadline: -10,
          },
          {
            kind: "registration",
            is_rolling: true,
            expired: false,
          },
        ]}
      />,
    );
    expect(screen.getByText("Deadline passed")).toBeInTheDocument();
    expect(screen.getAllByText("Rolling").length).toBeGreaterThan(0);
    expect(screen.getByTestId("deadline-list").querySelectorAll("li")).toHaveLength(
      2,
    );
  });

  it("treats conferences that ended before today as past", () => {
    const today = new Date("2026-08-19T12:00:00Z");
    expect(
      isPastConference(
        makeConference({ start_date: "2026-08-01", end_date: "2026-08-18" }),
        today,
      ),
    ).toBe(true);
    expect(
      isPastConference(
        makeConference({ start_date: "2026-08-19", end_date: "2026-08-21" }),
        today,
      ),
    ).toBe(false);
    expect(
      isPastConference(makeConference({ start_date: null, end_date: null }), today),
    ).toBe(false);
  });
});
