import { describe, expect, it } from "vitest";

import {
  decideModerationAction,
  defaultModerationConfig,
  moderationConfigSchema,
} from "./moderation-config.js";

describe("moderation configuration", () => {
  it("escalates to the highest reached threshold", () => {
    expect(
      decideModerationAction({
        activePoints: 10,
        config: defaultModerationConfig,
        requestedAction: "warn",
      }),
    ).toEqual({ action: "ban", escalated: true, timeoutMinutes: null });
  });

  it("uses the configured threshold timeout duration", () => {
    expect(
      decideModerationAction({
        activePoints: 3,
        config: defaultModerationConfig,
        requestedAction: "warn",
      }),
    ).toEqual({ action: "timeout", escalated: true, timeoutMinutes: 180 });
  });

  it("never downgrades a requested action", () => {
    expect(
      decideModerationAction({
        activePoints: 3,
        config: defaultModerationConfig,
        requestedAction: "kick",
      }).action,
    ).toBe("kick");
  });

  it("rejects non-increasing enabled thresholds", () => {
    expect(
      moderationConfigSchema.safeParse({
        ...defaultModerationConfig,
        thresholds: {
          ...defaultModerationConfig.thresholds,
          kick: { enabled: true, points: 3 },
        },
      }).success,
    ).toBe(false);
  });
});
