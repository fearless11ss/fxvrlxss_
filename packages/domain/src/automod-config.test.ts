import { describe, expect, it } from "vitest";

import { automodConfigSchema, defaultAutomodConfig } from "./automod-config.js";

describe("automodConfigSchema", () => {
  it("accepts the safe observation-mode default", () => {
    expect(automodConfigSchema.parse(defaultAutomodConfig).mode).toBe(
      "observe",
    );
  });

  it("upgrades drafts created before per-rule timeouts existed", () => {
    const legacy = structuredClone(defaultAutomodConfig) as Record<
      string,
      unknown
    >;
    const attachmentPolicy = legacy.attachmentPolicy as Record<string, unknown>;
    delete attachmentPolicy.maximumPerWindow;
    delete attachmentPolicy.windowSeconds;
    for (const key of [
      "attachmentPolicy",
      "caps",
      "emojiSpam",
      "flood",
      "inviteLinks",
      "repeatedMessages",
    ]) {
      delete (legacy[key] as Record<string, unknown>).timeoutMinutes;
    }
    legacy.timeoutMinutes = 10;
    delete legacy.messageLength;

    const parsed = automodConfigSchema.parse(legacy);
    expect(parsed.attachmentPolicy.maximumPerWindow).toBe(4);
    expect(parsed.attachmentPolicy.windowSeconds).toBe(30);
    expect(parsed.flood.timeoutMinutes).toBe(10);
    expect(parsed.inviteLinks.timeoutMinutes).toBe(10);
    expect(parsed.messageLength).toMatchObject({
      enabled: false,
      maximumCharacters: 1_500,
    });
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
        flood: { ...defaultAutomodConfig.flood, timeoutMinutes: 0 },
      }),
    ).toThrow();
  });
});
