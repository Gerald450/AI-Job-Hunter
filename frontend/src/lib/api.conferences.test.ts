import { describe, expect, it, vi } from "vitest";

import { fetchConferences } from "@/lib/api";

function calledUrl(fetchMock: ReturnType<typeof vi.fn>, index = 0): string {
  const calls = fetchMock.mock.calls as unknown as unknown[][];
  return String(calls[index]?.[0] ?? "");
}

describe("conference API client", () => {
  it("uses the recommended endpoint without include flags by default", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ conferences: [], total: 0, has_more: false }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchConferences();
    const url = calledUrl(fetchMock);
    expect(url).toContain("/api/conferences/recommended");
    expect(url).toContain("funding_available=true");
    expect(url).toContain("location_status=US");
    expect(url).not.toContain("include_not_eligible");
    expect(url).not.toContain("include_non_us");
    expect(url).not.toContain("virtual=true");
  });

  it("maps location All to include_non_us and U.S. to location_status", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ conferences: [], total: 0, has_more: false }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchConferences({ location: "all" });
    expect(calledUrl(fetchMock, 0)).toContain("include_non_us=true");
    expect(calledUrl(fetchMock, 0)).toContain("funding_available=true");
    expect(calledUrl(fetchMock, 0)).not.toContain("location_status=US");

    await fetchConferences({ location: "us" });
    expect(calledUrl(fetchMock, 1)).toContain("location_status=US");

    await fetchConferences({ location: "virtual" });
    expect(calledUrl(fetchMock, 2)).toContain("virtual=true");
  });
});
