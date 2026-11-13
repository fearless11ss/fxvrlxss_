import { describe, expect, it } from "vitest";

import { defaultTicketConfig, ticketConfigSchema } from "./ticket-config.js";

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
});
