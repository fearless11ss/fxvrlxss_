import { describe, expect, it } from "vitest";

import {
  defaultTicketConfig,
  supportTicketConfig,
  ticketConfigSchema,
} from "./ticket-config.js";

describe("ticket configuration", () => {
  it("accepts the canonical four ticket types", () => {
    expect(ticketConfigSchema.parse(defaultTicketConfig).types).toHaveLength(4);
  });

  it("rejects duplicate type keys", () => {
    const types = defaultTicketConfig.types.map((type) => ({ ...type }));
    types[1] = { ...types[0]! };
    expect(
      ticketConfigSchema.safeParse({ ...defaultTicketConfig, types }).success,
    ).toBe(false);
  });

  it("replaces the legacy main-server appeal route with bug reports", () => {
    const legacy = {
      ...defaultTicketConfig,
      types: [
        ...defaultTicketConfig.types.filter(({ key }) => key !== "bug-report"),
        {
          description: "Обжаловать наказание.",
          enabled: true,
          key: "punishment-appeal" as const,
          label: "Обжалование",
        },
      ],
    };

    expect(supportTicketConfig(legacy).types.map(({ key }) => key)).toEqual([
      "help",
      "member-report",
      "bug-report",
      "partnership",
    ]);
  });
});
