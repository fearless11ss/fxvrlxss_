import type { Database } from "@fxvrlxss/database/client";
import { temporaryVoiceRooms } from "@fxvrlxss/database/schema";
import { and, asc, eq } from "drizzle-orm";

import type {
  VoiceRoomRecord,
  VoiceRoomRepository,
} from "./voice-room-repository.js";

function record(row: typeof temporaryVoiceRooms.$inferSelect): VoiceRoomRecord {
  return {
    channelId: row.channelId,
    guildId: row.guildId,
    hidden: row.hidden,
    locked: row.locked,
    ownerId: row.ownerId,
    userLimit: row.userLimit,
  };
}

export class DatabaseVoiceRoomRepository implements VoiceRoomRepository {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  async create(input: VoiceRoomRecord): Promise<VoiceRoomRecord> {
    const [created] = await this.#database
      .insert(temporaryVoiceRooms)
      .values(input)
      .returning();
    if (!created) throw new Error("Temporary voice room was not returned");
    return record(created);
  }

  async findByChannel(channelId: string): Promise<VoiceRoomRecord | null> {
    const [row] = await this.#database
      .select()
      .from(temporaryVoiceRooms)
      .where(eq(temporaryVoiceRooms.channelId, channelId))
      .limit(1);
    return row ? record(row) : null;
  }

  async findByOwner(
    guildId: string,
    ownerId: string,
  ): Promise<VoiceRoomRecord | null> {
    const [row] = await this.#database
      .select()
      .from(temporaryVoiceRooms)
      .where(
        and(
          eq(temporaryVoiceRooms.guildId, guildId),
          eq(temporaryVoiceRooms.ownerId, ownerId),
        ),
      )
      .limit(1);
    return row ? record(row) : null;
  }

  async listGuild(guildId: string): Promise<readonly VoiceRoomRecord[]> {
    const rows = await this.#database
      .select()
      .from(temporaryVoiceRooms)
      .where(eq(temporaryVoiceRooms.guildId, guildId))
      .orderBy(asc(temporaryVoiceRooms.createdAt));
    return rows.map(record);
  }

  async remove(channelId: string): Promise<void> {
    await this.#database
      .delete(temporaryVoiceRooms)
      .where(eq(temporaryVoiceRooms.channelId, channelId));
  }

  async update(
    channelId: string,
    patch: Partial<
      Pick<VoiceRoomRecord, "hidden" | "locked" | "ownerId" | "userLimit">
    >,
  ): Promise<VoiceRoomRecord | null> {
    const [updated] = await this.#database
      .update(temporaryVoiceRooms)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(temporaryVoiceRooms.channelId, channelId))
      .returning();
    return updated ? record(updated) : null;
  }
}
