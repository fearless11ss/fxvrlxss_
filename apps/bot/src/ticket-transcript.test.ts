import { describe, expect, it } from "vitest";

import { buildTicketTranscriptFiles } from "./ticket-transcript.js";
import type {
  TicketRecord,
  TicketTranscriptEntry,
} from "./ticket-repository.js";

const ticket: TicketRecord = {
  assignedToId: "staff-1",
  authorId: "user-1",
  channelId: "channel-1",
  controlMessageId: "message-control",
  description: "Подробности обращения",
  id: "ticket-1",
  number: 7,
  participantIds: [],
  status: "closed",
  subject: "Нужна помощь",
  type: "help",
};

const entry: TicketTranscriptEntry = {
  attachments: [
    {
      name: "evidence.png",
      size: 42,
      url: "https://cdn.discordapp.com/evidence.png",
    },
  ],
  authorId: "user-1",
  authorName: "Участник",
  components: [],
  content: "Полный текст сообщения без сокращения.",
  createdAt: "2026-11-14T00:00:00.000Z",
  editedAt: null,
  embeds: [],
  messageId: "message-1",
  referencedMessageId: null,
  stickers: [],
};

describe("ticket transcript files", () => {
  it("includes ticket metadata, messages, authors, and attachments", () => {
    const [file] = buildTicketTranscriptFiles(
      ticket,
      {
        closedAt: new Date("2026-11-14T00:01:00.000Z"),
        reason: "Вопрос решён",
        typeLabel: "Помощь",
      },
      [entry],
    );
    const content = file?.data.toString("utf8") ?? "";

    expect(file?.name).toBe("ticket-0007-transcript-01.txt");
    expect(content).toContain("Type: Помощь");
    expect(content).toContain("Close reason: Вопрос решён");
    expect(content).toContain("Участник (user-1)");
    expect(content).toContain("Полный текст сообщения без сокращения.");
    expect(content).toContain("evidence.png (42 bytes)");
  });

  it("splits a long Unicode transcript without losing its contents", () => {
    const entries = Array.from({ length: 8 }, (_, index) => ({
      ...entry,
      content: `Сообщение ${index}: ${"данные ".repeat(12)}`,
      messageId: `message-${index}`,
    }));
    const files = buildTicketTranscriptFiles(
      ticket,
      {
        closedAt: new Date("2026-11-14T00:01:00.000Z"),
        reason: "Завершено",
        typeLabel: "Помощь",
      },
      entries,
      900,
    );
    const combined = files.map((file) => file.data.toString("utf8")).join("\n");

    expect(files.length).toBeGreaterThan(1);
    expect(files.every((file) => file.data.byteLength <= 900)).toBe(true);
    for (let index = 0; index < entries.length; index += 1) {
      expect(combined).toContain(`Сообщение ${index}`);
    }
    expect(combined).not.toContain("�");
  });
});
