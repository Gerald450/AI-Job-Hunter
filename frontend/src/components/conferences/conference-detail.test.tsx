import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ConferenceDetail } from "@/components/conferences/conference-detail";
import { makeConference } from "@/test/fixtures";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("ConferenceDetail", () => {
  it("renders eligibility, funding, multiple deadlines, and match reasons from the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () =>
          makeConference({
            deadlines: [
              {
                kind: "cfp",
                deadline_at: "2027-01-10",
                expired: true,
                days_until_deadline: -20,
              },
              {
                kind: "paper",
                deadline_at: "2027-04-01",
                expired: false,
                days_until_deadline: 40,
              },
              {
                kind: "travel_grant",
                deadline_at: "2027-03-15",
                expired: false,
                days_until_deadline: 21,
              },
            ],
            funding: [
              {
                name: "Student Travel Grant",
                kind: "travel_grant",
                amount: "Up to $1,000",
                deadline: "2027-03-15",
                eligibility_status: "NEEDS_VERIFICATION",
                paper_required: true,
              },
            ],
            funding_eligibility_status: "NEEDS_VERIFICATION",
            eligibility_status: "ELIGIBLE",
          }),
      })),
    );

    render(<ConferenceDetail conferenceId="conf-1" />, { wrapper });

    await waitFor(() => {
      expect(screen.getByTestId("conference-detail")).toBeInTheDocument();
    });
    expect(screen.getByText("Your Eligibility")).toBeInTheDocument();
    expect(screen.getByText("Funding Opportunities")).toBeInTheDocument();
    expect(screen.getByText("Important Deadlines")).toBeInTheDocument();
    expect(
      screen.getByText("Why This Conference Matches You"),
    ).toBeInTheDocument();

    const kinds = screen.getAllByTestId("deadline-list")[0];
    expect(kinds).toHaveTextContent("CFP deadline");
    expect(kinds).toHaveTextContent("Paper deadline");
    expect(kinds).toHaveTextContent("Travel grant");
    expect(kinds).toHaveTextContent("Deadline passed");

    expect(screen.getByTestId("funding-card")).toHaveTextContent(
      "Up to $1,000",
    );
    const badges = screen.getAllByTestId("eligibility-badge");
    expect(badges[0]).toHaveTextContent("Eligible");
    expect(badges.some((badge) => badge.textContent === "Needs Verification")).toBe(
      true,
    );
    expect(screen.getByTestId("detail-match-reasons")).toHaveTextContent(
      "+25 Computer Science",
    );
  });

  it("does not invent a funding amount when the backend omits it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () =>
          makeConference({
            funding: [
              {
                name: "Registration Waiver",
                kind: "registration_waiver",
                amount: null,
                eligibility_status: "ELIGIBLE",
              },
            ],
          }),
      })),
    );

    render(<ConferenceDetail conferenceId="conf-1" />, { wrapper });
    await screen.findByTestId("funding-card");
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it("shows a loading skeleton then an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({ detail: "nope" }),
      })),
    );
    render(<ConferenceDetail conferenceId="missing" />, { wrapper });
    await screen.findByText(/nope|failed|unable/i);
  });
});
