import type { ModerationAction } from "./moderation-config.js";

export const moderationAppealWindowDays = 30;

export type ModerationAppealStatus =
  "none" | "pending" | "approved" | "denied" | "withdrawn";

export type ModerationCaseLifecycle = "active" | "completed" | "revoked";

export function moderationCaseLifecycle(
  item: Readonly<{
    consequenceEndsAt: Date | null;
    revokedAt: Date | null;
  }>,
  now: Date,
): ModerationCaseLifecycle {
  if (item.revokedAt) return "revoked";
  if (item.consequenceEndsAt && item.consequenceEndsAt <= now) {
    return "completed";
  }
  return "active";
}

export function moderationAppealDeadline(createdAt: Date): Date {
  return new Date(
    createdAt.getTime() + moderationAppealWindowDays * 86_400_000,
  );
}

export function moderationConsequenceEndsAt(
  input: Readonly<{
    action: ModerationAction;
    indefinite: boolean;
    issuedAt: Date;
    points: number;
    pointsExpireAt: Date;
    timeoutMinutes: number | null;
  }>,
): Date | null {
  if (input.indefinite) return null;
  const candidates: Date[] = [];
  if (input.points > 0) candidates.push(input.pointsExpireAt);
  if (input.action === "timeout" && input.timeoutMinutes) {
    candidates.push(
      new Date(input.issuedAt.getTime() + input.timeoutMinutes * 60_000),
    );
  }
  if (candidates.length === 0) return input.issuedAt;
  return new Date(
    Math.max(...candidates.map((candidate) => candidate.getTime())),
  );
}
