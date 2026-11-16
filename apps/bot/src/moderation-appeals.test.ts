import { describe, expect, it } from "vitest";

import { assessModerationAppeal } from "./moderation-appeals.js";

describe("assessModerationAppeal", () => {
  it("distinguishes a reviewed appeal from a missing case", () => {
    expect(
      assessModerationAppeal(
        {
          appealOutcome: "denied",
          status: "open",
          userId: "user-1",
        },
        "user-1",
      ),
    ).toEqual({ eligible: false, reason: "already-reviewed" });
    expect(assessModerationAppeal(null, "user-1")).toEqual({
      eligible: false,
      reason: "not-found",
    });
  });

  it("keeps ownership private and detects an existing appeal", () => {
    expect(
      assessModerationAppeal(
        { appealOutcome: null, status: "open", userId: "someone-else" },
        "user-1",
      ),
    ).toEqual({ eligible: false, reason: "not-found" });
    expect(
      assessModerationAppeal(
        { appealOutcome: null, status: "appealed", userId: "user-1" },
        "user-1",
      ),
    ).toEqual({ eligible: false, reason: "already-open" });
  });
});
