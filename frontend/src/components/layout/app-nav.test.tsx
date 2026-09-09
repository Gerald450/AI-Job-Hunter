import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AppNav } from "@/components/layout/app-nav";

describe("AppNav", () => {
  it("links to Jobs, Conferences, and Applications", () => {
    render(<AppNav />);
    expect(screen.getByRole("link", { name: "Jobs" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: "Conferences" })).toHaveAttribute(
      "href",
      "/conferences",
    );
    expect(screen.getByRole("link", { name: "Applications" })).toHaveAttribute(
      "href",
      "/applications",
    );
    expect(screen.queryByRole("link", { name: "Scholarships" })).not.toBeInTheDocument();
  });
});
