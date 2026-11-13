import { describe, expect, it } from "vitest";

import { automodConfigSchema, defaultAutomodConfig } from "./automod-config.js";

describe("automodConfigSchema", () => {
  it("accepts the safe observation-mode default", () => {
    expect(automodConfigSchema.parse(defaultAutomodConfig).mode).toBe(
      "observe",
    );
  });

  it("rejects unsafe or nonsensical thresholds", () => {
    expect(() =>
      automodConfigSchema.parse({
        ...defaultAutomodConfig,
        flood: { ...defaultAutomodConfig.flood, maximumMessages: 1 },
      }),
    ).toThrow();
  });
});
