import { describe, expect, it } from "vitest";

import { appealTicketConfig } from "./appeal-guild-core.js";

describe("appeal guild ticket policy", () => {
  it("exposes only punishment appeals and keeps them single-use", () => {
    const config = appealTicketConfig(["staff-1"]);

    expect(config.allowReopen).toBe(false);
    expect(config.maxOpenTicketsPerUser).toBe(1);
    expect(config.staffRoleIds).toEqual(["staff-1"]);
    expect(config.types.filter(({ enabled }) => enabled)).toEqual([
      expect.objectContaining({ key: "punishment-appeal" }),
    ]);
  });
});
