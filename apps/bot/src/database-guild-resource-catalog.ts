import type { Database } from "@fxvrlxss/database/client";
import { discordResourceCatalog } from "@fxvrlxss/database/schema";
import { and, eq } from "drizzle-orm";

import type {
  GuildResourceCatalogEntry,
  GuildResourceCatalogWriter,
} from "./guild-resource-catalog.js";

export class DatabaseGuildResourceCatalogWriter implements GuildResourceCatalogWriter {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  async replace(
    guildId: string,
    entries: readonly GuildResourceCatalogEntry[],
  ): Promise<void> {
    await this.#database.transaction(async (transaction) => {
      await transaction
        .delete(discordResourceCatalog)
        .where(eq(discordResourceCatalog.guildId, guildId));
      if (entries.length === 0) return;
      await transaction.insert(discordResourceCatalog).values(
        entries.map((entry) => ({
          guildId,
          kind: entry.kind,
          name: entry.name,
          parentName: entry.parentName,
          position: entry.position,
          resourceId: entry.id,
          updatedAt: new Date(),
        })),
      );
    });
  }

  async remove(
    guildId: string,
    kind: GuildResourceCatalogEntry["kind"],
    resourceId: string,
  ): Promise<void> {
    await this.#database
      .delete(discordResourceCatalog)
      .where(
        and(
          eq(discordResourceCatalog.guildId, guildId),
          eq(discordResourceCatalog.kind, kind),
          eq(discordResourceCatalog.resourceId, resourceId),
        ),
      );
  }

  async upsert(
    guildId: string,
    entry: GuildResourceCatalogEntry,
  ): Promise<void> {
    await this.#database
      .insert(discordResourceCatalog)
      .values({
        guildId,
        kind: entry.kind,
        name: entry.name,
        parentName: entry.parentName,
        position: entry.position,
        resourceId: entry.id,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        set: {
          name: entry.name,
          parentName: entry.parentName,
          position: entry.position,
          updatedAt: new Date(),
        },
        target: [
          discordResourceCatalog.guildId,
          discordResourceCatalog.kind,
          discordResourceCatalog.resourceId,
        ],
      });
  }
}
