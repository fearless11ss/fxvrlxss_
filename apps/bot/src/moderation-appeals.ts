import {
  moderationAppealDeadline,
  moderationCaseLifecycle,
  type ModerationAppealStatus,
} from "@fxvrlxss/domain/moderation-case";

export type ModerationAppealOutcome = "approved" | "denied" | "withdrawn";

export type ModerationAppealEligibility =
  | { readonly eligible: true }
  | {
      readonly eligible: false;
      readonly reason:
        | "already-open"
        | "already-reviewed"
        | "completed"
        | "not-found"
        | "revoked"
        | "window-expired";
    };

export function assessModerationAppeal(
  item: {
    readonly appealStatus: ModerationAppealStatus;
    readonly consequenceEndsAt: Date | null;
    readonly createdAt: Date;
    readonly revokedAt: Date | null;
    readonly userId: string;
  } | null,
  userId: string,
  now: Date = new Date(),
): ModerationAppealEligibility {
  if (!item || item.userId !== userId) {
    return { eligible: false, reason: "not-found" };
  }
  if (item.appealStatus === "pending") {
    return { eligible: false, reason: "already-open" };
  }
  if (item.appealStatus !== "none") {
    return { eligible: false, reason: "already-reviewed" };
  }
  const lifecycle = moderationCaseLifecycle(item, now);
  if (lifecycle === "revoked") {
    return { eligible: false, reason: "revoked" };
  }
  if (lifecycle === "completed") {
    return { eligible: false, reason: "completed" };
  }
  if (moderationAppealDeadline(item.createdAt) <= now) {
    return { eligible: false, reason: "window-expired" };
  }
  return { eligible: true };
}

export interface ModerationAppealHandler {
  beginAppeal(caseNumber: number, userId: string): Promise<boolean>;
  checkAppeal(
    caseNumber: number,
    userId: string,
  ): Promise<ModerationAppealEligibility>;
  finishAppeal(input: {
    readonly actorId: string;
    readonly caseNumber: number;
    readonly outcome: ModerationAppealOutcome;
    readonly reason: string;
  }): Promise<boolean>;
}
