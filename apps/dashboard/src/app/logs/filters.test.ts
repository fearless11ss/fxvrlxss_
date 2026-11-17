import { describe, expect, it } from "vitest";

import { logsHref, parseLogFilters } from "./filters.js";

describe("log filters", () => {
  it("normalizes query parameters and rejects unsupported values", () => {
    expect(
      parseLogFilters({
        category: "unknown",
        event: [" member.timeout_changed ", "ignored"],
        from: "17.11.2026",
        page: "-4",
        q: "  Редактор  ",
        severity: "warning",
        to: "2026-11-17",
      }),
    ).toEqual({
      category: "all",
      event: "member.timeout_changed",
      from: "",
      page: 1,
      query: "Редактор",
      severity: "warning",
      to: "2026-11-17",
    });
  });

  it("keeps active filters when building a pagination link", () => {
    expect(
      logsHref(
        {
          category: "moderation",
          event: "moderation.automod_case_created",
          from: "2026-11-01",
          page: 1,
          query: "1263863111589564468",
          severity: "all",
          to: "",
        },
        3,
      ),
    ).toBe(
      "/logs?q=1263863111589564468&category=moderation&event=moderation.automod_case_created&from=2026-11-01&page=3",
    );
  });
});
