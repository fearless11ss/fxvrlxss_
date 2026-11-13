import type {
  TicketRecord,
  TicketTranscriptEntry,
} from "./ticket-repository.js";

export interface TicketTranscriptFile {
  readonly data: Buffer;
  readonly name: string;
}

export interface TicketTranscriptMetadata {
  readonly closedAt: Date;
  readonly reason: string;
  readonly typeLabel: string;
}

const DEFAULT_MAX_FILE_BYTES = 7 * 1024 * 1024;

function ticketNumber(value: number): string {
  return String(value).padStart(4, "0");
}

function json(value: readonly unknown[]): string {
  return JSON.stringify(value, null, 2);
}

function formatEntry(entry: TicketTranscriptEntry): string {
  const sections = [
    `[${entry.createdAt}] ${entry.authorName} (${entry.authorId})`,
    `Message ID: ${entry.messageId}`,
    entry.editedAt ? `Edited at: ${entry.editedAt}` : undefined,
    entry.referencedMessageId
      ? `Reply to message: ${entry.referencedMessageId}`
      : undefined,
    "",
    entry.content || "[без текстового содержимого]",
    entry.attachments.length > 0
      ? [
          "",
          "Attachments:",
          ...entry.attachments.map(
            (attachment) =>
              `- ${attachment.name} (${attachment.size} bytes): ${attachment.url}`,
          ),
        ].join("\n")
      : undefined,
    entry.stickers.length > 0
      ? [
          "",
          "Stickers:",
          ...entry.stickers.map(
            (sticker) => `- ${sticker.name} (${sticker.id}): ${sticker.url}`,
          ),
        ].join("\n")
      : undefined,
    entry.embeds.length > 0 ? `\nEmbeds:\n${json(entry.embeds)}` : undefined,
    entry.components.length > 0
      ? `\nComponents:\n${json(entry.components)}`
      : undefined,
  ];
  return `${sections.filter((section) => section !== undefined).join("\n")}\n${"-".repeat(72)}\n`;
}

function splitUtf8(value: string, maximumBytes: number): string[] {
  const parts: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character);
    if (current && currentBytes + characterBytes > maximumBytes) {
      parts.push(current);
      current = "";
      currentBytes = 0;
    }
    current += character;
    currentBytes += characterBytes;
  }
  if (current) parts.push(current);
  return parts;
}

export function buildTicketTranscriptFiles(
  ticket: TicketRecord,
  metadata: TicketTranscriptMetadata,
  entries: readonly TicketTranscriptEntry[],
  maximumBytes = DEFAULT_MAX_FILE_BYTES,
): readonly TicketTranscriptFile[] {
  const number = ticketNumber(ticket.number);
  const header = [
    "FXVRLXSS_ TICKET TRANSCRIPT",
    `Ticket: #${number}`,
    `Type: ${metadata.typeLabel}`,
    `Author ID: ${ticket.authorId}`,
    `Subject: ${ticket.subject}`,
    `Description: ${ticket.description}`,
    `Close reason: ${metadata.reason}`,
    `Closed at: ${metadata.closedAt.toISOString()}`,
    `Messages: ${entries.length}`,
    "=".repeat(72),
    "",
  ].join("\n");
  if (Buffer.byteLength(header) >= maximumBytes) {
    throw new Error("Transcript file limit is too small for its metadata");
  }

  const chunks: string[] = [];
  let current = header;
  for (const entry of entries) {
    const block = formatEntry(entry);
    const available = maximumBytes - Buffer.byteLength(header);
    for (const part of splitUtf8(block, available)) {
      if (Buffer.byteLength(current) + Buffer.byteLength(part) > maximumBytes) {
        chunks.push(current);
        current = header;
      }
      current += part;
    }
  }
  if (current !== header || chunks.length === 0) chunks.push(current);

  return chunks.map((content, index) => ({
    data: Buffer.from(content, "utf8"),
    name: `ticket-${number}-transcript-${String(index + 1).padStart(2, "0")}.txt`,
  }));
}
