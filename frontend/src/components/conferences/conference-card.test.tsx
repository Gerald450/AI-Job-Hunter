import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConferenceCard } from "@/components/conferences/conference-card";
import { makeConference } from "@/test/fixtures";

const noop = async () => undefined;

describe("ConferenceCard", () => {
  it("renders API name, organization, match, eligibility, location, and dates", () => {
    render(
      <ConferenceCard
        conference={makeConference()}
        onToggleSaved={noop}
        onTrackingChange={noop}
      />,
    );

    expect(screen.getByText("94% Match")).toBeInTheDocument();
    expect(
      screen.getByText("International Conference on Software Engineering"),
    ).toBeInTheDocument();
    expect(screen.getByText("ACM")).toBeInTheDocument();
    expect(screen.getByText("Eligible")).toBeInTheDocument();
    expect(screen.getByText(/Seattle, WA/)).toBeInTheDocument();
    expect(screen.getByText(/May 10/)).toBeInTheDocument();
  });

  it("shows travel grant only when the backend returns it", () => {
    const { rerender } = render(
      <ConferenceCard
        conference={makeConference({ travel_grant_available: true })}
        onToggleSaved={noop}
        onTrackingChange={noop}
      />,
    );
    expect(screen.getByTestId("funding-availability")).toHaveTextContent(
      /travel grant/i,
    );

    rerender(
      <ConferenceCard
        conference={makeConference({
          travel_grant_available: false,
          funding_available: false,
          funding: [],
        })}
        onToggleSaved={noop}
        onTrackingChange={noop}
      />,
    );
    expect(screen.queryByTestId("funding-availability")).not.toBeInTheDocument();
  });

  it("displays multiple deadlines separately and highlights the primary one", () => {
    render(
      <ConferenceCard
        conference={makeConference()}
        onToggleSaved={noop}
        onTrackingChange={noop}
      />,
    );
    expect(screen.getByTestId("primary-deadline")).toHaveTextContent(
      "Travel grant",
    );
    expect(screen.getByText("2 deadlines listed")).toBeInTheDocument();
  });

  it("labels Needs Verification and never calls it Eligible", () => {
    render(
      <ConferenceCard
        conference={makeConference({
          eligibility_status: "NEEDS_VERIFICATION",
        })}
        onToggleSaved={noop}
        onTrackingChange={noop}
      />,
    );
    const badge = screen.getByTestId("eligibility-badge");
    expect(badge).toHaveTextContent("Needs Verification");
    expect(badge).not.toHaveTextContent("Eligible");
    expect(badge).toHaveAttribute("data-status", "NEEDS_VERIFICATION");
  });

  it("opens match breakdown from backend factors", async () => {
    const user = userEvent.setup();
    render(
      <ConferenceCard
        conference={makeConference()}
        onToggleSaved={noop}
        onTrackingChange={noop}
      />,
    );
    await user.click(screen.getByTestId("match-score"));
    expect(screen.getByTestId("match-breakdown")).toHaveTextContent(
      "+25 Computer Science",
    );
    expect(screen.getByTestId("match-breakdown")).toHaveTextContent(
      "+20 Undergraduate eligibility",
    );
  });

  it("shows undergraduate eligibility from API fields, not hardcoded profile text", () => {
    render(
      <ConferenceCard
        conference={makeConference({ undergraduate_eligible: true })}
        onToggleSaved={noop}
        onTrackingChange={noop}
      />,
    );
    expect(screen.getByText("Undergraduate eligible")).toBeInTheDocument();
    expect(screen.queryByText(/May 2027/)).not.toBeInTheDocument();
  });

  it("does not crash on malformed nested arrays", () => {
    render(
      <ConferenceCard
        conference={makeConference({
          topics: null,
          funding: null,
          deadlines: null,
          match_reasons: null,
        })}
        onToggleSaved={noop}
        onTrackingChange={noop}
      />,
    );
    expect(
      screen.getByText("International Conference on Software Engineering"),
    ).toBeInTheDocument();
  });

  it("calls save handler", async () => {
    const onToggleSaved = vi.fn(async () => undefined);
    const user = userEvent.setup();
    render(
      <ConferenceCard
        conference={makeConference({ saved: false })}
        onToggleSaved={onToggleSaved}
        onTrackingChange={noop}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onToggleSaved).toHaveBeenCalledWith("conf-1", true);
  });
});
