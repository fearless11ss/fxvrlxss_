import type { Database } from "@fxvrlxss/database/client";
import { auditEvents, configurationVersions } from "@fxvrlxss/database/schema";
import { and, asc, desc, eq } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import type {
  VoicePublicationRepository,
  VoiceVersionRecord,
} from "./voice-publication.js";

export class DatabaseVoicePublicationRepository implements VoicePublicationRepository {
  readonly #database: Database;
  readonly #guildId: string;

  constructor(database: Database, guildId: string) {
    this.#database = database;
    this.#guildId = guildId;
  }

  async findLatestPublished(): Promise<VoiceVersionRecord | null> {
    return this.#findByStatus("published", desc(configurationVersions.version));
  }

  async findNextQueued(): Promise<VoiceVersionRecord | null> {
    return this.#findByStatus("queued", asc(configurationVersions.version));
  }

  async markFailed(record: VoiceVersionRecord, reason: string): Promise<void> {
    await this.#database.transaction(async (transaction) => {
      await transaction
        .update(configurationVersions)
        .set({ failureReason: reason, status: "failed", updatedAt: new Date() })
        .where(
          and(
            eq(configurationVersions.id, record.id),
            eq(configurationVersions.status, "queued"),
          ),
        );
      await transaction.insert(auditEvents).values({
        actorType: "bot",
        category: "bot",
        eventType: "configuration.voice_publication_failed",
        guildId: this.#guildId,
        payload: { reason, version: record.version },
        severity: "critical",
      });
    });
  }

  async markPublished(record: VoiceVersionRecord): Promise<void> {
    const now = new Date();
    await this.#database.transaction(async (transaction) => {
      await transaction
        .update(configurationVersions)
        .set({ status: "superseded", updatedAt: now })
        .where(
          and(
            eq(configurationVersions.module, "voice"),
            eq(configurationVersions.status, "published"),
          ),
        );
      await transaction
        .update(configurationVersions)
        .set({
          failureReason: null,
          publishedAt: now,
          status: "published",
          updatedAt: now,
        })
        .where(
          and(
            eq(configurationVersions.id, record.id),
            eq(configurationVersions.status, "queued"),
          ),
        );
      await transaction.insert(auditEvents).values({
        actorType: "bot",
        category: "bot",
        eventType: "configuration.voice_published",
        guildId: this.#guildId,
        payload: { version: record.version },
      });
    });
  }

  async #findByStatus(
    status: "published" | "queued",
    order: SQL,
  ): Promise<VoiceVersionRecord | null> {
    const rows = await this.#database
      .select({
        id: configurationVersions.id,
        payload: configurationVersions.payload,
        version: configurationVersions.version,
      })
      .from(configurationVersions)
      .where(
        and(
          eq(configurationVersions.module, "voice"),
          eq(configurationVersions.status, status),
        ),
      )
      .orderBy(order)
      .limit(1);
    return rows[0] ?? null;
  }
}
