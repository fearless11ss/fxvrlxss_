import type { Database } from "@fxvrlxss/database/client";
import { voiceOwnerAccess } from "@fxvrlxss/database/schema";
import { and, asc, eq } from "drizzle-orm";

import type {
  VoiceAccessEntry,
  VoiceAccessKind,
  VoiceAccessRepository,
} from "./voice-access-repository.js";

function entry(row: typeof voiceOwnerAccess.$inferSelect): VoiceAccessEntry {
  return {
    guildId: row.guildId,
    kind: row.kind,
    ownerId: row.ownerId,
    subjectId: row.subjectId,
  };
}

export class DatabaseVoiceAccessRepository implements VoiceAccessRepository {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  async list(
    guildId: string,
    ownerId: string,
  ): Promise<readonly VoiceAccessEntry[]> {
    const rows = await this.#database
      .select()
      .from(voiceOwnerAccess)
      .where(
        and(
          eq(voiceOwnerAccess.guildId, guildId),
          eq(voiceOwnerAccess.ownerId, ownerId),
        ),
      )
      .orderBy(asc(voiceOwnerAccess.createdAt));
    return rows.map(entry);
  }

  async set(
    guildId: string,
    ownerId: string,
    subjectId: string,
    kind: VoiceAccessKind | null,
  ): Promise<void> {
    const identity = and(
      eq(voiceOwnerAccess.guildId, guildId),
      eq(voiceOwnerAccess.ownerId, ownerId),
      eq(voiceOwnerAccess.subjectId, subjectId),
    );
    if (kind === null) {
      await this.#database.delete(voiceOwnerAccess).where(identity);
      return;
    }
    await this.#database
      .insert(voiceOwnerAccess)
      .values({ guildId, kind, ownerId, subjectId })
      .onConflictDoUpdate({
        set: { kind, updatedAt: new Date() },
        target: [
          voiceOwnerAccess.guildId,
          voiceOwnerAccess.ownerId,
          voiceOwnerAccess.subjectId,
        ],
      });
  }
}
