import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { UpcomingDeadlines } from "@/components/conferences/upcoming-deadlines";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("UpcomingDeadlines", () => {
  it("links deadline rows to the conference detail page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          total: 1,
          deadlines: [
            {
              kind: "travel_grant",
              deadline_at: "2027-03-15",
              days_until_deadline: 7,
              expired: false,
              closing_soon: true,
              conference_id: "conf-99",
              conference_name: "ICSE",
            },
          ],
        }),
      })),
    );

    render(<UpcomingDeadlines />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText("ICSE")).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /Travel grant/i })).toHaveAttribute(
      "href",
      "/conferences/conf-99",
    );
  });
});
