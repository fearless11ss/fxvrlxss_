import { describe, expect, it } from "vitest";

import { membersHref, parseMemberFilters } from "./filters.js";

describe("member directory filters", () => {
  it("normalizes search parameters", () => {
    expect(
      parseMemberFilters({
        member: "not-a-discord-id",
        page: "0",
        q: "  Редактор  ",
        scope: "attention",
      }),
    ).toEqual({
      memberId: "",
      page: 1,
      query: "Редактор",
      scope: "attention",
    });
  });

  it("preserves the directory state in member links", () => {
    expect(
      membersHref(
        {
          memberId: "",
          page: 2,
          query: "126386",
          scope: "history",
        },
        { memberId: "1263863111589564468" },
      ),
    ).toBe("/members?q=126386&scope=history&member=1263863111589564468&page=2");
  });
});
