export type ModerationAppealOutcome = "approved" | "denied" | "withdrawn";

export interface ModerationAppealHandler {
  beginAppeal(caseNumber: number, userId: string): Promise<boolean>;
  canAppeal(caseNumber: number, userId: string): Promise<boolean>;
  finishAppeal(input: {
    readonly actorId: string;
    readonly caseNumber: number;
    readonly outcome: ModerationAppealOutcome;
    readonly reason: string;
  }): Promise<boolean>;
}
