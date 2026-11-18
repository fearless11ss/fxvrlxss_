import type { ModerationAction } from "@fxvrlxss/domain/moderation-config";
import type { ModerationAppealStatus } from "@fxvrlxss/domain/moderation-case";

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
  readonly appealStartedAt: Date | null;
  readonly appealStatus: ModerationAppealStatus;
  readonly appealReason: string | null;
  readonly appealResolvedAt: Date | null;
  readonly appealResolvedById: string | null;
  readonly createdAt: Date;
  readonly evidence: ModerationEvidence;
  readonly consequenceEndsAt: Date | null;
  readonly guildId: string;
  readonly id: string;
  readonly moderatorId: string;
  readonly number: number;
  readonly points: number;
  readonly requestedAction: ModerationAction;
  readonly pointsExpireAt: Date | null;
  readonly revocationReason: string | null;
  readonly revokedAt: Date | null;
  readonly revokedById: string | null;
  readonly sourceEventKey: string | null;
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
    readonly createdAt: Date;
    readonly evidence: ModerationEvidence;
    readonly consequenceEndsAt: Date | null;
    readonly guildId: string;
    readonly moderatorId: string;
    readonly points: number;
    readonly pointsExpireAt: Date;
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
  endSanction(input: {
    readonly action: "ban" | "quarantine" | "timeout";
    readonly guildId: string;
    readonly userId: string;
  }): Promise<void>;
  listForUser(
    guildId: string,
    userId: string,
    limit: number,
  ): Promise<readonly ModerationCaseRecord[]>;
  finishAppeal(input: {
    readonly actorId: string;
    readonly guildId: string;
    readonly number: number;
    readonly outcome: "approved" | "denied" | "withdrawn";
    readonly reason: string;
  }): Promise<ModerationCaseRecord | null>;
  revoke(input: {
    readonly actorId: string;
    readonly guildId: string;
    readonly number: number;
    readonly reason: string;
  }): Promise<ModerationCaseRecord | null>;
}
