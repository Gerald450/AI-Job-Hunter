import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { JobList } from "@/components/jobs/job-list";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("Jobs page still works", () => {
  it("renders the jobs list from /api/jobs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        expect(url).toContain("/api/jobs");
        expect(url).not.toContain("/api/conferences");
        return {
          ok: true,
          json: async () => ({
            jobs: [
              {
                id: "job-1",
                company: "Acme",
                role: "New Grad SWE",
                location: "NYC",
                apply_url: "https://example.com/job",
                age: "2d",
                source: "greenhouse",
                ats_source: "Greenhouse",
                faang: false,
                no_sponsorship: false,
                citizenship_required: false,
                advanced_degree: false,
                closed: false,
                applied: false,
                saved: false,
                flagged: false,
                sponsorship_available: true,
                sponsorship_match: "yes",
                sponsorship_confidence: 0.9,
                created_at: "2026-01-01T00:00:00Z",
                updated_at: "2026-01-01T00:00:00Z",
              },
            ],
            total: 1,
            has_more: false,
            stats: {
              total: 1,
              applied: 0,
              remaining: 1,
              saved: 0,
              flagged: 0,
            },
          }),
        };
      }),
    );

    render(<JobList />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText("Acme")).toBeInTheDocument();
    });
    expect(screen.getByText("New Grad SWE")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /View job posting/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Apply/i })).toBeInTheDocument();
  });
});
