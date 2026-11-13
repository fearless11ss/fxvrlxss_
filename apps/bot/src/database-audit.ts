import type { Database } from "@fxvrlxss/database/client";
import { auditEvents } from "@fxvrlxss/database/schema";

import type { AuditEvent, AuditWriter } from "./audit.js";

export class DatabaseAuditWriter implements AuditWriter {
  readonly name = "postgresql";
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  async write(event: AuditEvent): Promise<void> {
    await this.#database.insert(auditEvents).values({
      actorId: event.actorId,
      actorType: event.actorId ? "discord-user" : "system",
      category: event.category,
      eventType: event.eventType,
      guildId: event.guildId,
      occurredAt: event.occurredAt,
      payload: {
        ...event.payload,
        discord: event.discord,
        summary: event.summary,
        title: event.title,
      },
      severity: event.severity,
      subjectId: event.subjectId,
    });
  }
}
