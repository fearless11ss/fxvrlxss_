import type { Database } from "@fxvrlxss/database/client";
import { auditEvents } from "@fxvrlxss/database/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import type {
  ArchivedMessage,
  MessageArchiveReader,
} from "./message-archive.js";

const attachmentSchema = z.object({
  contentType: z.string().nullable().optional(),
  id: z.string(),
  name: z.string(),
  size: z.number(),
  url: z.string(),
});

const messageSchema = z.object({
  attachments: z.array(attachmentSchema),
  channelId: z.string(),
  content: z.string().nullable(),
  messageId: z.string(),
});

const updatedMessageSchema = z.object({ after: messageSchema });

export class DatabaseMessageArchiveReader implements MessageArchiveReader {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  async findLatest(
    guildId: string,
    messageId: string,
  ): Promise<ArchivedMessage | null> {
    const rows = await this.#database
      .select({
        actorId: auditEvents.actorId,
        eventType: auditEvents.eventType,
        payload: auditEvents.payload,
      })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.guildId, guildId),
          eq(auditEvents.subjectId, messageId),
          inArray(auditEvents.eventType, [
            "message.updated",
            "message.created",
          ]),
        ),
      )
      .orderBy(desc(auditEvents.occurredAt))
      .limit(20);

    for (const row of rows) {
      let message: z.infer<typeof messageSchema>;
      if (row.eventType === "message.updated") {
        const parsed = updatedMessageSchema.safeParse(row.payload);
        if (!parsed.success) continue;
        message = parsed.data.after;
      } else {
        const parsed = messageSchema.safeParse(row.payload);
        if (!parsed.success) continue;
        message = parsed.data;
      }
      if (message.content === null) continue;
      return {
        attachments: message.attachments.map((attachment) => ({
          ...(attachment.contentType !== undefined
            ? { contentType: attachment.contentType }
            : {}),
          id: attachment.id,
          name: attachment.name,
          size: attachment.size,
          url: attachment.url,
        })),
        ...(row.actorId ? { authorId: row.actorId } : {}),
        channelId: message.channelId,
        content: message.content,
        messageId: message.messageId,
      };
    }
    return null;
  }
}
