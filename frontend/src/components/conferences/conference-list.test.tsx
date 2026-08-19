import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ConferenceList } from "@/components/conferences/conference-list";
import { makeConference } from "@/test/fixtures";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function mockJson(data: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => data,
  };
}

describe("ConferenceList", () => {
  it("loads recommended conferences and hides NOT_ELIGIBLE and NON_US rows", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/stats")) {
        return mockJson({
          recommended: 2,
          with_funding: 1,
          travel_grants: 1,
          deadlines_this_month: 0,
        });
      }
      if (url.includes("/deadlines")) {
        return mockJson({ deadlines: [], total: 0 });
      }
      return mockJson({
        conferences: [
          makeConference({ id: "us", location_status: "US" }),
          makeConference({
            id: "virtual",
            name: "Virtual ML Conf",
            location_status: "VIRTUAL",
            is_virtual: true,
            location: "Online",
          }),
          makeConference({
            id: "bad",
            name: "Grad Only Summit",
            eligibility_status: "NOT_ELIGIBLE",
          }),
          makeConference({
            id: "unfunded",
            name: "Unfunded US Conf",
            funding_available: false,
            travel_grant_available: false,
            scholarship_available: false,
            registration_waiver_available: false,
            funding: [],
          }),
          makeConference({
            id: "london",
            name: "London Systems Conf",
            location_status: "NON_US",
            location: "London, UK",
          }),
          makeConference({
            id: "past",
            name: "Last Year Summit",
            start_date: "2025-06-01",
            end_date: "2025-06-05",
          }),
        ],
        total: 6,
        has_more: false,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ConferenceList />, { wrapper });

    await waitFor(() => {
      expect(
        screen.getByText("International Conference on Software Engineering"),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText("Virtual ML Conf")).not.toBeInTheDocument();
    expect(screen.queryByText("Grad Only Summit")).not.toBeInTheDocument();
    expect(screen.queryByText("London Systems Conf")).not.toBeInTheDocument();
    expect(screen.queryByText("Unfunded US Conf")).not.toBeInTheDocument();
    expect(screen.queryByText("Last Year Summit")).not.toBeInTheDocument();

    const listCall = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .find((url) => url.includes("/recommended"));
    expect(listCall).toBeTruthy();
    expect(listCall).toContain("funding_available=true");
    expect(listCall).toContain("location_status=US");
    expect(listCall).not.toContain("include_not_eligible");
    expect(listCall).not.toContain("include_non_us");
  });

  it("shows stats from the API, not hardcoded values", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/stats")) {
          return mockJson({
            recommended: 24,
            with_funding: 9,
            travel_grants: 5,
            deadlines_this_month: 3,
          });
        }
        if (url.includes("/deadlines")) {
          return mockJson({ deadlines: [], total: 0 });
        }
        return mockJson({ conferences: [], total: 0, has_more: false });
      }),
    );

    render(<ConferenceList />, { wrapper });

    await waitFor(() => {
      expect(screen.getByTestId("conference-stats")).toHaveTextContent("24");
    });
    expect(screen.getByTestId("conference-stats")).toHaveTextContent("9");
    expect(screen.getByTestId("conference-stats")).toHaveTextContent("5");
    expect(screen.getByTestId("conference-stats")).toHaveTextContent("3");
  });

  it("debounces search onto the server query", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/stats")) {
        return mockJson({
          recommended: 0,
          with_funding: 0,
          travel_grants: 0,
          deadlines_this_month: 0,
        });
      }
      if (url.includes("/deadlines")) {
        return mockJson({ deadlines: [], total: 0 });
      }
      return mockJson({ conferences: [], total: 0, has_more: false });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ConferenceList />, { wrapper });

    await screen.findByPlaceholderText(/Conference name/i);
    await user.type(
      screen.getByPlaceholderText(/Conference name/i),
      "neurips",
    );

    await waitFor(
      () => {
        expect(
          fetchMock.mock.calls.some((call) =>
            String(call[0]).includes("search=neurips"),
          ),
        ).toBe(true);
      },
      { timeout: 1500 },
    );
  });

  it("sends eligibility and funding filters server-side", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/stats")) {
        return mockJson({
          recommended: 0,
          with_funding: 0,
          travel_grants: 0,
          deadlines_this_month: 0,
        });
      }
      if (url.includes("/deadlines")) {
        return mockJson({ deadlines: [], total: 0 });
      }
      return mockJson({ conferences: [], total: 0, has_more: false });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ConferenceList />, { wrapper });

    await screen.findByLabelText("Filter by eligibility");
    await user.selectOptions(
      screen.getByLabelText("Filter by eligibility"),
      "NEEDS_VERIFICATION",
    );
    await user.selectOptions(
      screen.getByLabelText("Filter by funding"),
      "eligible",
    );

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((call) => String(call[0]));
      expect(
        urls.some(
          (url) =>
            url.includes("eligibility=NEEDS_VERIFICATION") &&
            url.includes("funding_available=true") &&
            url.includes("funding_eligibility=ELIGIBLE"),
        ),
      ).toBe(true);
    });
  });

  it("paginates with Load More", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/stats")) {
        return mockJson({
          recommended: 2,
          with_funding: 0,
          travel_grants: 0,
          deadlines_this_month: 0,
        });
      }
      if (url.includes("/deadlines")) {
        return mockJson({ deadlines: [], total: 0 });
      }
      if (url.includes("offset=25")) {
        return mockJson({
          conferences: [makeConference({ id: "page-2", name: "Second Page Conf" })],
          total: 2,
          has_more: false,
        });
      }
      return mockJson({
        conferences: [makeConference({ id: "page-1", name: "First Page Conf" })],
        total: 2,
        has_more: true,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ConferenceList />, { wrapper });

    await screen.findByText("First Page Conf");
    await user.click(screen.getByRole("button", { name: "Load More" }));
    await screen.findByText("Second Page Conf");
  });

  it("renders a loading skeleton then an empty state", async () => {
    let resolveList: ((value: unknown) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/stats")) {
          return mockJson({
            recommended: 0,
            with_funding: 0,
            travel_grants: 0,
            deadlines_this_month: 0,
          });
        }
        if (url.includes("/deadlines")) {
          return mockJson({ deadlines: [], total: 0 });
        }
        return new Promise((resolve) => {
          resolveList = resolve;
        });
      }),
    );

    const { rerender } = render(<ConferenceList />, { wrapper });
    expect(screen.getByTestId("conference-skeleton")).toBeInTheDocument();
    resolveList?.(
      mockJson({ conferences: [], total: 0, has_more: false }),
    );
    await screen.findByText(
      "No conferences currently match your eligibility criteria.",
    );
    expect(
      screen.getByRole("button", {
        name: "View conferences needing verification",
      }),
    ).toBeInTheDocument();
    rerender(<ConferenceList />);
  });

  it("shows an API error state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/stats")) {
          return mockJson({
            recommended: 0,
            with_funding: 0,
            travel_grants: 0,
            deadlines_this_month: 0,
          });
        }
        if (url.includes("/deadlines")) {
          return mockJson({ deadlines: [], total: 0 });
        }
        return mockJson({}, false);
      }),
    );

    render(<ConferenceList />, { wrapper });
    await screen.findByText(/Failed to load conferences/i);
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
