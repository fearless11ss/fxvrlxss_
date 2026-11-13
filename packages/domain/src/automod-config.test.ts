import { describe, expect, it } from "vitest";

import { automodConfigSchema, defaultAutomodConfig } from "./automod-config.js";

describe("automodConfigSchema", () => {
  it("accepts the safe observation-mode default", () => {
    expect(automodConfigSchema.parse(defaultAutomodConfig).mode).toBe(
      "observe",
    );
  });

  it("upgrades drafts created before rate and timeout fields existed", () => {
    const legacy = structuredClone(defaultAutomodConfig) as Record<
      string,
      unknown
    >;
    const attachmentPolicy = legacy.attachmentPolicy as Record<string, unknown>;
    delete attachmentPolicy.maximumPerWindow;
    delete attachmentPolicy.windowSeconds;
    delete legacy.timeoutMinutes;

    const parsed = automodConfigSchema.parse(legacy);
    expect(parsed.attachmentPolicy.maximumPerWindow).toBe(4);
    expect(parsed.attachmentPolicy.windowSeconds).toBe(30);
    expect(parsed.timeoutMinutes).toBe(10);
  });

  it("rejects unsafe or nonsensical thresholds", () => {
    expect(() =>
      automodConfigSchema.parse({
        ...defaultAutomodConfig,
        flood: { ...defaultAutomodConfig.flood, maximumMessages: 1 },
      }),
    ).toThrow();
    expect(() =>
      automodConfigSchema.parse({
        ...defaultAutomodConfig,
        attachmentPolicy: {
          ...defaultAutomodConfig.attachmentPolicy,
          maximumPerWindow: 0,
        },
      }),
    ).toThrow();
    expect(() =>
      automodConfigSchema.parse({
        ...defaultAutomodConfig,
        timeoutMinutes: 0,
      }),
    ).toThrow();
  });
});
