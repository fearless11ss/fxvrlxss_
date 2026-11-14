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

function dateTime(value: string | Date): string {
  return `${new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: "Europe/Moscow",
    year: "numeric",
  }).format(new Date(value))} МСК`;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function formatEmbeds(embeds: readonly unknown[]): string | undefined {
  const lines: string[] = [];
  for (const [index, rawEmbed] of embeds.entries()) {
    const embed = record(rawEmbed);
    if (!embed) continue;
    const author = record(embed.author);
    const footer = record(embed.footer);
    const image = record(embed.image);
    const thumbnail = record(embed.thumbnail);
    const fields = Array.isArray(embed.fields) ? embed.fields : [];
    const details = [
      text(author?.name) ? `Автор: ${text(author?.name)}` : undefined,
      text(embed.title) ? `Заголовок: ${text(embed.title)}` : undefined,
      text(embed.description),
      text(embed.url) ? `Ссылка: ${text(embed.url)}` : undefined,
      ...fields.flatMap((rawField) => {
        const field = record(rawField);
        return field
          ? [`${text(field.name) ?? "Поле"}: ${text(field.value) ?? "—"}`]
          : [];
      }),
      text(image?.url) ? `Изображение: ${text(image?.url)}` : undefined,
      text(thumbnail?.url) ? `Миниатюра: ${text(thumbnail?.url)}` : undefined,
      text(footer?.text) ? `Подпись: ${text(footer?.text)}` : undefined,
    ].filter((line): line is string => Boolean(line));
    if (details.length > 0) {
      lines.push(`Встроенная карточка ${index + 1}:`, ...details);
    }
  }
  return lines.length > 0 ? lines.join("\n") : undefined;
}

function replaceKnownMentions(
  content: string,
  authorNames: ReadonlyMap<string, string>,
): string {
  return content.replaceAll(/<@!?(\d+)>/g, (mention, id: string) => {
    const name = authorNames.get(id);
    return name ? `@${name}` : mention;
  });
}

function isControlPanel(entry: TicketTranscriptEntry): boolean {
  return (
    Boolean(entry.authorBot) &&
    entry.content.trim().length === 0 &&
    entry.attachments.length === 0 &&
    entry.stickers.length === 0 &&
    entry.embeds.length === 0 &&
    entry.components.length > 0
  );
}

export function countReadableTicketTranscriptEntries(
  entries: readonly TicketTranscriptEntry[],
): number {
  return entries.filter((entry) => !isControlPanel(entry)).length;
}

function formatEntry(
  entry: TicketTranscriptEntry,
  authorNames: ReadonlyMap<string, string>,
): string {
  const embedText = formatEmbeds(entry.embeds);
  const sections = [
    `${dateTime(entry.createdAt)} — ${entry.authorName}${entry.authorBot ? " [бот]" : ""}`,
    entry.editedAt ? `Изменено: ${dateTime(entry.editedAt)}` : undefined,
    entry.referencedMessageId
      ? `↳ Ответ на сообщение ${entry.referencedMessageId}`
      : undefined,
    "",
    entry.content
      ? replaceKnownMentions(entry.content, authorNames)
      : "[сообщение без текста]",
    entry.attachments.length > 0
      ? [
          "",
          "Вложения:",
          ...entry.attachments.map(
            (attachment) =>
              `- ${attachment.name} (${attachment.size} байт)\n  ${attachment.url}`,
          ),
        ].join("\n")
      : undefined,
    entry.stickers.length > 0
      ? [
          "",
          "Стикеры:",
          ...entry.stickers.map(
            (sticker) => `- ${sticker.name}\n  ${sticker.url}`,
          ),
        ].join("\n")
      : undefined,
    embedText ? `\n${embedText}` : undefined,
  ];
  return `${sections.filter((section) => section !== undefined).join("\n")}\n${"─".repeat(72)}\n`;
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
  const visibleEntries = entries.filter((entry) => !isControlPanel(entry));
  const authorNames = new Map(
    visibleEntries.map((entry) => [entry.authorId, entry.authorName] as const),
  );
  const ticketAuthor = authorNames.get(ticket.authorId);
  const header = [
    `Транскрипт тикета #${number}`,
    `Тип обращения: ${metadata.typeLabel}`,
    `Автор: ${ticketAuthor ?? "неизвестный пользователь"} (ID: ${ticket.authorId})`,
    `Тема: ${ticket.subject}`,
    `Описание: ${ticket.description}`,
    `Причина закрытия: ${metadata.reason}`,
    `Закрыт: ${dateTime(metadata.closedAt)}`,
    `Сообщений в диалоге: ${visibleEntries.length}`,
    "═".repeat(72),
    "",
  ].join("\n");
  if (Buffer.byteLength(header) >= maximumBytes) {
    throw new Error("Transcript file limit is too small for its metadata");
  }

  const chunks: string[] = [];
  let current = header;
  for (const entry of visibleEntries) {
    const block = formatEntry(entry, authorNames);
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
