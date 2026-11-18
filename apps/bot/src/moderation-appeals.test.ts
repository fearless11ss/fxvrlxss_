import { describe, expect, it } from "vitest";

import { assessModerationAppeal } from "./moderation-appeals.js";

describe("assessModerationAppeal", () => {
  const now = new Date("2026-11-18T10:00:00.000Z");

  it("distinguishes a reviewed appeal from a missing case", () => {
    expect(
      assessModerationAppeal(
        {
          appealStatus: "denied",
          consequenceEndsAt: null,
          createdAt: new Date("2026-11-01T00:00:00.000Z"),
          revokedAt: null,
          userId: "user-1",
        },
        "user-1",
        now,
      ),
    ).toEqual({ eligible: false, reason: "already-reviewed" });
    expect(assessModerationAppeal(null, "user-1", now)).toEqual({
      eligible: false,
      reason: "not-found",
    });
  });

  it("keeps ownership private and detects an existing appeal", () => {
    expect(
      assessModerationAppeal(
        {
          appealStatus: "none",
          consequenceEndsAt: null,
          createdAt: new Date("2026-11-01T00:00:00.000Z"),
          revokedAt: null,
          userId: "someone-else",
        },
        "user-1",
        now,
      ),
    ).toEqual({ eligible: false, reason: "not-found" });
    expect(
      assessModerationAppeal(
        {
          appealStatus: "pending",
          consequenceEndsAt: null,
          createdAt: new Date("2026-11-01T00:00:00.000Z"),
          revokedAt: null,
          userId: "user-1",
        },
        "user-1",
        now,
      ),
    ).toEqual({ eligible: false, reason: "already-open" });
  });

  it("rejects a fully completed punishment", () => {
    expect(
      assessModerationAppeal(
        {
          appealStatus: "none",
          consequenceEndsAt: new Date("2026-11-18T09:00:00.000Z"),
          createdAt: new Date("2026-11-17T09:00:00.000Z"),
          revokedAt: null,
          userId: "user-1",
        },
        "user-1",
        new Date("2026-11-18T10:00:00.000Z"),
      ),
    ).toEqual({ eligible: false, reason: "completed" });
  });

  it("caps an otherwise active punishment at thirty days", () => {
    expect(
      assessModerationAppeal(
        {
          appealStatus: "none",
          consequenceEndsAt: null,
          createdAt: new Date("2026-10-18T09:00:00.000Z"),
          revokedAt: null,
          userId: "user-1",
        },
        "user-1",
        now,
      ),
    ).toEqual({ eligible: false, reason: "window-expired" });
  });
});
