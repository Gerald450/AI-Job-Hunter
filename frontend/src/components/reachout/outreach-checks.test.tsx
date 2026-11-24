import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { OutreachChecks } from "@/components/reachout/outreach-checks";
import {
  applyOutreachUpdate,
  type OutreachFlags,
  type OutreachPatch,
} from "@/lib/reachout";

function Harness({ initial }: { initial: OutreachFlags }) {
  const [flags, setFlags] = useState(initial);
  return (
    <OutreachChecks
      name="Mindy Holt"
      flags={flags}
      showLabels
      onPatch={(patch: OutreachPatch) =>
        setFlags((current) => applyOutreachUpdate(current, patch))
      }
    />
  );
}

function followedUp() {
  return screen.getByRole("checkbox", { name: /Followed up/i });
}

function responded() {
  return screen.getByRole("checkbox", { name: /^Responded /i });
}

function reachedOut() {
  return screen.getByRole("checkbox", { name: /Reached out/i });
}

describe("outreach checkbox rule", () => {
  it("checks and disables Followed up while responded, then restores the manual value", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={{
          reached_out: true,
          responded: true,
          followed_up: true,
          followed_up_manual: false,
        }}
      />,
    );

    expect(followedUp()).toBeChecked();
    expect(followedUp()).toBeDisabled();
    expect(screen.getByText("(auto)")).toBeInTheDocument();

    await user.click(responded());

    expect(responded()).not.toBeChecked();
    expect(followedUp()).not.toBeChecked();
    expect(followedUp()).toBeEnabled();
    expect(screen.queryByText("(auto)")).not.toBeInTheDocument();
    expect(reachedOut()).toBeChecked();
  });

  it("restores a manual follow-up when responded is unchecked", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={{
          reached_out: true,
          responded: true,
          followed_up: true,
          followed_up_manual: true,
        }}
      />,
    );

    expect(followedUp()).toBeChecked();
    expect(followedUp()).toBeDisabled();

    await user.click(responded());

    expect(responded()).not.toBeChecked();
    expect(followedUp()).toBeChecked();
    expect(followedUp()).toBeEnabled();
    expect(screen.queryByText("(auto)")).not.toBeInTheDocument();
  });

  it("lets a manual follow-up be set without marking responded, then auto-checks on reply", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={{
          reached_out: false,
          responded: false,
          followed_up: false,
          followed_up_manual: false,
        }}
      />,
    );

    await user.click(followedUp());

    expect(followedUp()).toBeChecked();
    expect(followedUp()).toBeEnabled();
    expect(responded()).not.toBeChecked();
    expect(reachedOut()).not.toBeChecked();
    expect(screen.queryByText("(auto)")).not.toBeInTheDocument();

    await user.click(responded());

    expect(responded()).toBeChecked();
    expect(reachedOut()).toBeChecked();
    expect(followedUp()).toBeChecked();
    expect(followedUp()).toBeDisabled();
    expect(screen.getByText("(auto)")).toBeInTheDocument();
  });
});
