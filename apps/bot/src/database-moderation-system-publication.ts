import type { Database } from "@fxvrlxss/database/client";
import { configurationVersions } from "@fxvrlxss/database/schema";
import { and, asc, desc, eq } from "drizzle-orm";

import type {
  ModerationSystemPublicationRepository,
  ModerationSystemVersionRecord,
} from "./moderation-system-publication.js";

const MODULE = "moderation-system";

function record(
  row: typeof configurationVersions.$inferSelect,
): ModerationSystemVersionRecord {
  return { id: row.id, payload: row.payload, version: row.version };
}

export class DatabaseModerationSystemPublicationRepository implements ModerationSystemPublicationRepository {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  async findLatestPublished(): Promise<ModerationSystemVersionRecord | null> {
    const [row] = await this.#database
      .select()
      .from(configurationVersions)
      .where(
        and(
          eq(configurationVersions.module, MODULE),
          eq(configurationVersions.status, "published"),
        ),
      )
      .orderBy(desc(configurationVersions.version))
      .limit(1);
    return row ? record(row) : null;
  }

  async findNextQueued(): Promise<ModerationSystemVersionRecord | null> {
    const [row] = await this.#database
      .select()
      .from(configurationVersions)
      .where(
        and(
          eq(configurationVersions.module, MODULE),
          eq(configurationVersions.status, "queued"),
        ),
      )
      .orderBy(asc(configurationVersions.version))
      .limit(1);
    return row ? record(row) : null;
  }

  async markFailed(
    item: ModerationSystemVersionRecord,
    reason: string,
  ): Promise<void> {
    await this.#database
      .update(configurationVersions)
      .set({ failureReason: reason, status: "failed", updatedAt: new Date() })
      .where(eq(configurationVersions.id, item.id));
  }

  async markPublished(item: ModerationSystemVersionRecord): Promise<void> {
    await this.#database.transaction(async (transaction) => {
      await transaction
        .update(configurationVersions)
        .set({ status: "superseded", updatedAt: new Date() })
        .where(
          and(
            eq(configurationVersions.module, MODULE),
            eq(configurationVersions.status, "published"),
          ),
        );
      await transaction
        .update(configurationVersions)
        .set({
          failureReason: null,
          publishedAt: new Date(),
          status: "published",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(configurationVersions.id, item.id),
            eq(configurationVersions.status, "queued"),
          ),
        );
    });
  }
}
