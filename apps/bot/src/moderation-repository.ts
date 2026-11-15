import type { ModerationAction } from "@fxvrlxss/domain/moderation-config";

export interface ModerationEvidence {
  readonly automodAction?: string;
  readonly channelId?: string;
  readonly messageDeleted?: boolean;
  readonly messageId?: string;
  readonly reference: string | null;
  readonly signals?: readonly string[];
  readonly source?: "automod" | "manual";
}

export interface ModerationCaseRecord {
  readonly appliedAction: ModerationAction;
  readonly appealOutcome: "approved" | "denied" | "withdrawn" | null;
  readonly appealReason: string | null;
  readonly appealResolvedAt: Date | null;
  readonly appealResolvedById: string | null;
  readonly createdAt: Date;
  readonly evidence: ModerationEvidence;
  readonly expiresAt: Date | null;
  readonly guildId: string;
  readonly id: string;
  readonly moderatorId: string;
  readonly number: number;
  readonly points: number;
  readonly requestedAction: ModerationAction;
  readonly resolutionReason: string | null;
  readonly resolvedAt: Date | null;
  readonly resolvedById: string | null;
  readonly sourceEventKey: string | null;
  readonly status: "open" | "appealed" | "resolved";
  readonly summary: string;
  readonly timeoutMinutes: number | null;
  readonly userId: string;
}

export interface ModerationRepository {
  activePoints(guildId: string, userId: string, now: Date): Promise<number>;
  beginAppeal(input: {
    readonly guildId: string;
    readonly number: number;
    readonly userId: string;
  }): Promise<ModerationCaseRecord | null>;
  create(input: {
    readonly appliedAction: ModerationAction;
    readonly evidence: ModerationEvidence;
    readonly expiresAt: Date;
    readonly guildId: string;
    readonly moderatorId: string;
    readonly points: number;
    readonly requestedAction: ModerationAction;
    readonly sourceEventKey?: string;
    readonly summary: string;
    readonly timeoutMinutes: number | null;
    readonly userId: string;
  }): Promise<{
    readonly created: boolean;
    readonly record: ModerationCaseRecord;
  }>;
  findByNumber(
    guildId: string,
    number: number,
  ): Promise<ModerationCaseRecord | null>;
  listForUser(
    guildId: string,
    userId: string,
    limit: number,
  ): Promise<readonly ModerationCaseRecord[]>;
  finishAppeal(input: {
    readonly guildId: string;
    readonly number: number;
    readonly outcome: "approved" | "denied" | "withdrawn";
    readonly reason: string;
    readonly resolvedById: string;
  }): Promise<ModerationCaseRecord | null>;
  resolve(input: {
    readonly guildId: string;
    readonly number: number;
    readonly reason: string;
    readonly resolvedById: string;
  }): Promise<ModerationCaseRecord | null>;
}
