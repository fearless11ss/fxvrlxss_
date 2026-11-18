import { describe, expect, it } from "vitest";

import {
  moderationAppealDeadline,
  moderationCaseLifecycle,
  moderationConsequenceEndsAt,
} from "./moderation-case.js";

describe("moderation case lifecycle", () => {
  const issuedAt = new Date("2026-11-18T10:00:00.000Z");
  const pointsExpireAt = new Date("2027-02-16T10:00:00.000Z");

  it("keeps a timeout active until its last consequence ends", () => {
    expect(
      moderationConsequenceEndsAt({
        action: "timeout",
        indefinite: false,
        issuedAt,
        points: 1,
        pointsExpireAt,
        timeoutMinutes: 120,
      }),
    ).toEqual(pointsExpireAt);
  });

  it("completes an immediate kick and keeps bans indefinite", () => {
    expect(
      moderationConsequenceEndsAt({
        action: "kick",
        indefinite: false,
        issuedAt,
        points: 0,
        pointsExpireAt,
        timeoutMinutes: null,
      }),
    ).toEqual(issuedAt);
    expect(
      moderationConsequenceEndsAt({
        action: "ban",
        indefinite: true,
        issuedAt,
        points: 6,
        pointsExpireAt,
        timeoutMinutes: null,
      }),
    ).toBeNull();
  });

  it("distinguishes completion from revocation", () => {
    expect(
      moderationCaseLifecycle(
        { consequenceEndsAt: issuedAt, revokedAt: null },
        new Date("2026-11-18T10:00:01.000Z"),
      ),
    ).toBe("completed");
    expect(
      moderationCaseLifecycle(
        { consequenceEndsAt: null, revokedAt: issuedAt },
        issuedAt,
      ),
    ).toBe("revoked");
  });

  it("uses a thirty-day appeal ceiling", () => {
    expect(moderationAppealDeadline(issuedAt)).toEqual(
      new Date("2026-12-18T10:00:00.000Z"),
    );
  });
});
