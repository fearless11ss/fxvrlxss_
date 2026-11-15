import type { Database } from "@fxvrlxss/database/client";
import { moderationCases } from "@fxvrlxss/database/schema";
import { and, desc, eq, gt, inArray, isNull, or, sum } from "drizzle-orm";

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
    appealOutcome: row.appealOutcome,
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
    expiresAt: row.expiresAt,
    guildId: row.guildId,
    id: row.id,
    moderatorId: row.moderatorId,
    number: row.number,
    points: row.points,
    requestedAction: row.requestedAction,
    resolutionReason: row.resolutionReason,
    resolvedAt: row.resolvedAt,
    resolvedById: row.resolvedById,
    sourceEventKey: row.sourceEventKey,
    status: row.status,
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
          inArray(moderationCases.status, ["open", "appealed"]),
          or(
            isNull(moderationCases.expiresAt),
            gt(moderationCases.expiresAt, now),
          ),
        ),
      );
    return Number(row?.value ?? 0);
  }

  async beginAppeal(
    input: Parameters<ModerationRepository["beginAppeal"]>[0],
  ): Promise<ModerationCaseRecord | null> {
    const [updated] = await this.#database
      .update(moderationCases)
      .set({ status: "appealed", updatedAt: new Date() })
      .where(
        and(
          eq(moderationCases.guildId, input.guildId),
          eq(moderationCases.number, input.number),
          eq(moderationCases.userId, input.userId),
          eq(moderationCases.status, "open"),
          isNull(moderationCases.appealOutcome),
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
        evidence: input.evidence,
        expiresAt: input.expiresAt,
        guildId: input.guildId,
        moderatorId: input.moderatorId,
        points: input.points,
        requestedAction: input.requestedAction,
        ...(input.sourceEventKey
          ? { sourceEventKey: input.sourceEventKey }
          : {}),
        summary: input.summary,
        timeoutMinutes: input.timeoutMinutes,
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
        appealOutcome: input.outcome,
        appealReason: input.reason,
        appealResolvedAt: now,
        appealResolvedById: input.resolvedById,
        ...(approved
          ? {
              resolutionReason: `Обжалование удовлетворено: ${input.reason}`,
              resolvedAt: now,
              resolvedById: input.resolvedById,
            }
          : {}),
        status: approved ? "resolved" : "open",
        updatedAt: now,
      })
      .where(
        and(
          eq(moderationCases.guildId, input.guildId),
          eq(moderationCases.number, input.number),
          eq(moderationCases.status, "appealed"),
        ),
      )
      .returning();
    return updated ? record(updated) : null;
  }

  async resolve(
    input: Parameters<ModerationRepository["resolve"]>[0],
  ): Promise<ModerationCaseRecord | null> {
    const now = new Date();
    const [updated] = await this.#database
      .update(moderationCases)
      .set({
        resolutionReason: input.reason,
        resolvedAt: now,
        resolvedById: input.resolvedById,
        status: "resolved",
        updatedAt: now,
      })
      .where(
        and(
          eq(moderationCases.guildId, input.guildId),
          eq(moderationCases.number, input.number),
          inArray(moderationCases.status, ["open", "appealed"]),
        ),
      )
      .returning();
    return updated ? record(updated) : null;
  }
}
