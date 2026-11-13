import type { Database } from "@fxvrlxss/database/client";
import { discordResourceCatalog } from "@fxvrlxss/database/schema";
import { eq } from "drizzle-orm";

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
}
