import { randomUUID } from "node:crypto";

import type { Database } from "@fxvrlxss/database/client";
import { tickets } from "@fxvrlxss/database/schema";
import { and, asc, eq, inArray, isNull, like, lt, sql } from "drizzle-orm";

import type {
  TicketRecord,
  TicketRepository,
  TicketReservation,
  TicketTranscriptEntry,
} from "./ticket-repository.js";

const activeStates = ["open", "claimed", "reopened"] as const;

function record(row: typeof tickets.$inferSelect): TicketRecord {
  return {
    assignedToId: row.assignedToId,
    authorId: row.authorId,
    channelId: row.channelId,
    channelDeletedAt: row.channelDeletedAt,
    controlMessageId: row.controlMessageId,
    description: row.description,
    id: row.id,
    moderationCaseNumber: row.moderationCaseNumber,
    number: row.number,
    participantIds: row.participantIds,
    status: row.status,
    subject: row.subject,
    type: row.type,
  };
}

export class DatabaseTicketRepository implements TicketRepository {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  async reserve(input: {
    readonly authorId: string;
    readonly description: string;
    readonly guildId: string;
    readonly maxOpenTickets: number;
    readonly moderationCaseNumber?: number;
    readonly subject: string;
    readonly type: string;
  }): Promise<TicketReservation> {
    return this.#database.transaction(async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtext(${input.guildId}), hashtext(${input.authorId}))`,
      );
      await transaction
        .delete(tickets)
        .where(
          and(
            eq(tickets.guildId, input.guildId),
            eq(tickets.authorId, input.authorId),
            like(tickets.channelId, "pending:%"),
            lt(tickets.updatedAt, new Date(Date.now() - 10 * 60_000)),
          ),
        );
      const active = await transaction
        .select()
        .from(tickets)
        .where(
          and(
            eq(tickets.guildId, input.guildId),
            eq(tickets.authorId, input.authorId),
            inArray(tickets.status, activeStates),
          ),
        );
      if (active.some(({ type }) => type === input.type)) {
        return { reason: "duplicate-type", success: false };
      }
      if (active.length >= input.maxOpenTickets) {
        return { reason: "limit", success: false };
      }
      const [created] = await transaction
        .insert(tickets)
        .values({
          authorId: input.authorId,
          channelId: `pending:${randomUUID()}`,
          description: input.description,
          guildId: input.guildId,
          moderationCaseNumber: input.moderationCaseNumber,
          subject: input.subject,
          type: input.type,
        })
        .returning();
      if (!created) throw new Error("Ticket reservation was not returned");
      return { record: record(created), success: true };
    });
  }

  async activate(id: string, channelId: string): Promise<TicketRecord> {
    const [updated] = await this.#database
      .update(tickets)
      .set({ channelId, updatedAt: new Date() })
      .where(eq(tickets.id, id))
      .returning();
    if (!updated) throw new Error("Ticket reservation no longer exists");
    return record(updated);
  }

  async abandon(id: string): Promise<void> {
    await this.#database.delete(tickets).where(eq(tickets.id, id));
  }

  async findByChannel(channelId: string): Promise<TicketRecord | null> {
    const [row] = await this.#database
      .select()
      .from(tickets)
      .where(eq(tickets.channelId, channelId))
      .limit(1);
    return row ? record(row) : null;
  }

  async claim(
    channelId: string,
    staffId: string,
  ): Promise<TicketRecord | null> {
    const [updated] = await this.#database
      .update(tickets)
      .set({
        assignedToId: staffId,
        claimedAt: new Date(),
        status: "claimed",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tickets.channelId, channelId),
          inArray(tickets.status, ["open", "reopened"]),
        ),
      )
      .returning();
    return updated ? record(updated) : null;
  }

  async close(
    channelId: string,
    reason: string,
    transcript: readonly TicketTranscriptEntry[] | null,
  ): Promise<TicketRecord | null> {
    const [updated] = await this.#database
      .update(tickets)
      .set({
        closeReason: reason,
        closedAt: new Date(),
        status: "closed",
        transcript,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tickets.channelId, channelId),
          inArray(tickets.status, activeStates),
        ),
      )
      .returning();
    return updated ? record(updated) : null;
  }

  async reopen(channelId: string): Promise<TicketRecord | null> {
    const [updated] = await this.#database
      .update(tickets)
      .set({
        closeReason: null,
        closedAt: null,
        reopenedAt: new Date(),
        status: "reopened",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tickets.channelId, channelId),
          eq(tickets.status, "closed"),
          isNull(tickets.channelDeletedAt),
        ),
      )
      .returning();
    return updated ? record(updated) : null;
  }

  async markChannelDeleted(channelId: string): Promise<TicketRecord | null> {
    const now = new Date();
    const [updated] = await this.#database
      .update(tickets)
      .set({ channelDeletedAt: now, updatedAt: now })
      .where(
        and(
          eq(tickets.channelId, channelId),
          eq(tickets.status, "closed"),
          isNull(tickets.channelDeletedAt),
        ),
      )
      .returning();
    return updated ? record(updated) : null;
  }

  async setControlMessage(
    channelId: string,
    messageId: string,
  ): Promise<TicketRecord | null> {
    const [updated] = await this.#database
      .update(tickets)
      .set({ controlMessageId: messageId, updatedAt: new Date() })
      .where(eq(tickets.channelId, channelId))
      .returning();
    return updated ? record(updated) : null;
  }

  async setParticipants(
    channelId: string,
    participantIds: readonly string[],
  ): Promise<TicketRecord | null> {
    const [updated] = await this.#database
      .update(tickets)
      .set({ participantIds: [...participantIds], updatedAt: new Date() })
      .where(eq(tickets.channelId, channelId))
      .returning();
    return updated ? record(updated) : null;
  }

  async touch(channelId: string): Promise<void> {
    await this.#database
      .update(tickets)
      .set({ updatedAt: new Date() })
      .where(
        and(
          eq(tickets.channelId, channelId),
          inArray(tickets.status, activeStates),
        ),
      );
  }

  async findInactive(
    guildId: string,
    before: Date,
  ): Promise<readonly TicketRecord[]> {
    const rows = await this.#database
      .select()
      .from(tickets)
      .where(
        and(
          eq(tickets.guildId, guildId),
          inArray(tickets.status, activeStates),
          eq(tickets.autoCloseDisabled, false),
          lt(tickets.updatedAt, before),
        ),
      )
      .orderBy(asc(tickets.updatedAt));
    return rows.map(record);
  }

  async findClosedWithChannels(
    guildId: string,
  ): Promise<readonly TicketRecord[]> {
    const rows = await this.#database
      .select()
      .from(tickets)
      .where(
        and(
          eq(tickets.guildId, guildId),
          eq(tickets.status, "closed"),
          isNull(tickets.channelDeletedAt),
        ),
      )
      .orderBy(asc(tickets.number));
    return rows.map(record);
  }
}
