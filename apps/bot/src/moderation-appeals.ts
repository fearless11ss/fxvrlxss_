export type ModerationAppealOutcome = "approved" | "denied" | "withdrawn";

export type ModerationAppealEligibility =
  | { readonly eligible: true }
  | {
      readonly eligible: false;
      readonly reason:
        "already-open" | "already-reviewed" | "closed" | "not-found";
    };

export function assessModerationAppeal(
  item: {
    readonly appealOutcome: ModerationAppealOutcome | null;
    readonly status: "appealed" | "open" | "resolved";
    readonly userId: string;
  } | null,
  userId: string,
): ModerationAppealEligibility {
  if (!item || item.userId !== userId) {
    return { eligible: false, reason: "not-found" };
  }
  if (item.appealOutcome !== null) {
    return { eligible: false, reason: "already-reviewed" };
  }
  if (item.status === "appealed") {
    return { eligible: false, reason: "already-open" };
  }
  if (item.status !== "open") {
    return { eligible: false, reason: "closed" };
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
