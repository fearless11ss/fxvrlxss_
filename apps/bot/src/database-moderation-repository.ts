import type { Database } from "@fxvrlxss/database/client";
import { moderationCases } from "@fxvrlxss/database/schema";
import { moderationAppealWindowDays } from "@fxvrlxss/domain/moderation-case";
import { and, desc, eq, gt, isNull, or, sql, sum } from "drizzle-orm";

import type {
  ModerationCaseRecord,
  ModerationEvidence,
  ModerationRepository,
} from "./moderation-repository.js";

function record(
  row: typeof moderationCases.$inferSelect,
): ModerationCaseRecord {
  const evidence = row.evidence as Partial<ModerationEvidence>;
  return {
    appliedAction: row.appliedAction,
    appealStartedAt: row.appealStartedAt,
    appealStatus: row.appealStatus,
    appealReason: row.appealReason,
    appealResolvedAt: row.appealResolvedAt,
    appealResolvedById: row.appealResolvedById,
    createdAt: row.createdAt,
    evidence: {
      ...(typeof evidence.automodAction === "string"
        ? { automodAction: evidence.automodAction }
        : {}),
      ...(typeof evidence.channelId === "string"
        ? { channelId: evidence.channelId }
        : {}),
      ...(typeof evidence.messageDeleted === "boolean"
        ? { messageDeleted: evidence.messageDeleted }
        : {}),
      ...(typeof evidence.messageId === "string"
        ? { messageId: evidence.messageId }
        : {}),
      reference:
        typeof evidence.reference === "string" ? evidence.reference : null,
      ...(Array.isArray(evidence.signals) &&
      evidence.signals.every((signal) => typeof signal === "string")
        ? { signals: evidence.signals }
        : {}),
      ...(evidence.source === "automod" || evidence.source === "manual"
        ? { source: evidence.source }
        : {}),
    },
    consequenceEndsAt: row.consequenceEndsAt,
    guildId: row.guildId,
    id: row.id,
    moderatorId: row.moderatorId,
    number: row.number,
    points: row.points,
    requestedAction: row.requestedAction,
    pointsExpireAt: row.pointsExpireAt,
    revocationReason: row.revocationReason,
    revokedAt: row.revokedAt,
    revokedById: row.revokedById,
    sourceEventKey: row.sourceEventKey,
    summary: row.summary,
    timeoutMinutes: row.timeoutMinutes,
    userId: row.userId,
  };
}

export class DatabaseModerationRepository implements ModerationRepository {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  async activePoints(
    guildId: string,
    userId: string,
    now: Date,
  ): Promise<number> {
    const [row] = await this.#database
      .select({ value: sum(moderationCases.points) })
      .from(moderationCases)
      .where(
        and(
          eq(moderationCases.guildId, guildId),
          eq(moderationCases.userId, userId),
          isNull(moderationCases.revokedAt),
          gt(moderationCases.pointsExpireAt, now),
        ),
      );
    return Number(row?.value ?? 0);
  }

  async beginAppeal(
    input: Parameters<ModerationRepository["beginAppeal"]>[0],
  ): Promise<ModerationCaseRecord | null> {
    const now = new Date();
    const [updated] = await this.#database
      .update(moderationCases)
      .set({
        appealStartedAt: now,
        appealStatus: "pending",
        updatedAt: now,
      })
      .where(
        and(
          eq(moderationCases.guildId, input.guildId),
          eq(moderationCases.number, input.number),
          eq(moderationCases.userId, input.userId),
          eq(moderationCases.appealStatus, "none"),
          isNull(moderationCases.revokedAt),
          or(
            isNull(moderationCases.consequenceEndsAt),
            gt(moderationCases.consequenceEndsAt, now),
          ),
          gt(
            moderationCases.createdAt,
            new Date(now.getTime() - moderationAppealWindowDays * 86_400_000),
          ),
        ),
      )
      .returning();
    return updated ? record(updated) : null;
  }

  async create(
    input: Parameters<ModerationRepository["create"]>[0],
  ): ReturnType<ModerationRepository["create"]> {
    const [created] = await this.#database
      .insert(moderationCases)
      .values({
        appliedAction: input.appliedAction,
        consequenceEndsAt: input.consequenceEndsAt,
        createdAt: input.createdAt,
        evidence: input.evidence,
        pointsExpireAt: input.pointsExpireAt,
        guildId: input.guildId,
        moderatorId: input.moderatorId,
        points: input.points,
        requestedAction: input.requestedAction,
        ...(input.sourceEventKey
          ? { sourceEventKey: input.sourceEventKey }
          : {}),
        summary: input.summary,
        timeoutMinutes: input.timeoutMinutes,
        updatedAt: input.createdAt,
        userId: input.userId,
      })
      .onConflictDoNothing()
      .returning();
    if (created) return { created: true, record: record(created) };
    if (!input.sourceEventKey) {
      throw new Error("Moderation case was not returned");
    }
    const [existing] = await this.#database
      .select()
      .from(moderationCases)
      .where(
        and(
          eq(moderationCases.guildId, input.guildId),
          eq(moderationCases.sourceEventKey, input.sourceEventKey),
        ),
      )
      .limit(1);
    if (!existing) throw new Error("Moderation case conflict was not found");
    return { created: false, record: record(existing) };
  }

  async findByNumber(
    guildId: string,
    number: number,
  ): Promise<ModerationCaseRecord | null> {
    const [row] = await this.#database
      .select()
      .from(moderationCases)
      .where(
        and(
          eq(moderationCases.guildId, guildId),
          eq(moderationCases.number, number),
        ),
      )
      .limit(1);
    return row ? record(row) : null;
  }

  async endSanction(
    input: Parameters<ModerationRepository["endSanction"]>[0],
  ): Promise<void> {
    const now = new Date();
    const actionCondition =
      input.action === "quarantine"
        ? sql`${moderationCases.evidence}->>'automodAction' = 'quarantine'`
        : eq(moderationCases.appliedAction, input.action);
    await this.#database
      .update(moderationCases)
      .set({
        consequenceEndsAt: sql`CASE
          WHEN ${moderationCases.points} > 0 AND ${moderationCases.pointsExpireAt} > ${now}
          THEN ${moderationCases.pointsExpireAt}
          ELSE ${now}
        END`,
        updatedAt: now,
      })
      .where(
        and(
          eq(moderationCases.guildId, input.guildId),
          eq(moderationCases.userId, input.userId),
          isNull(moderationCases.revokedAt),
          actionCondition,
          or(
            isNull(moderationCases.consequenceEndsAt),
            gt(moderationCases.consequenceEndsAt, now),
          ),
        ),
      );
  }

  async listForUser(
    guildId: string,
    userId: string,
    limit: number,
  ): Promise<readonly ModerationCaseRecord[]> {
    const rows = await this.#database
      .select()
      .from(moderationCases)
      .where(
        and(
          eq(moderationCases.guildId, guildId),
          eq(moderationCases.userId, userId),
        ),
      )
      .orderBy(desc(moderationCases.number))
      .limit(limit);
    return rows.map(record);
  }

  async finishAppeal(
    input: Parameters<ModerationRepository["finishAppeal"]>[0],
  ): Promise<ModerationCaseRecord | null> {
    const now = new Date();
    const approved = input.outcome === "approved";
    const [updated] = await this.#database
      .update(moderationCases)
      .set({
        appealStatus: input.outcome,
        appealReason: input.reason,
        appealResolvedAt: now,
        appealResolvedById: input.actorId,
        ...(approved
          ? {
              revocationReason: `Обжалование удовлетворено: ${input.reason}`,
              revokedAt: now,
              revokedById: input.actorId,
            }
          : {}),
        updatedAt: now,
      })
      .where(
        and(
          eq(moderationCases.guildId, input.guildId),
          eq(moderationCases.number, input.number),
          eq(moderationCases.appealStatus, "pending"),
        ),
      )
      .returning();
    return updated ? record(updated) : null;
  }

  async revoke(
    input: Parameters<ModerationRepository["revoke"]>[0],
  ): Promise<ModerationCaseRecord | null> {
    const now = new Date();
    const [updated] = await this.#database
      .update(moderationCases)
      .set({
        revocationReason: input.reason,
        revokedAt: now,
        revokedById: input.actorId,
        updatedAt: now,
      })
      .where(
        and(
          eq(moderationCases.guildId, input.guildId),
          eq(moderationCases.number, input.number),
          isNull(moderationCases.revokedAt),
          eq(moderationCases.appealStatus, "none"),
        ),
      )
      .returning();
    return updated ? record(updated) : null;
  }
}
