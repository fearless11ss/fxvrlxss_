import type {
  ArchivedMessage,
  ArchivedMessageAttachment,
} from "./message-archive.js";

export interface DeletedMessageSnapshot {
  readonly attachments: readonly ArchivedMessageAttachment[];
  readonly authorId?: string;
  readonly channelId: string;
  readonly content: string | null;
  readonly messageId: string;
}

function excerpt(content: string | null | undefined): string {
  if (!content) return "[содержимое недоступно]";
  return content.length > 700 ? `${content.slice(0, 699)}…` : content;
}

export function buildDeletedMessageLog(
  live: DeletedMessageSnapshot,
  archived: ArchivedMessage | null,
) {
  const content = live.content ?? archived?.content;
  const attachments =
    live.attachments.length > 0
      ? live.attachments
      : (archived?.attachments ?? []);
  const authorId = live.authorId ?? archived?.authorId;
  return {
    ...(authorId ? { actorId: authorId } : {}),
    payload: {
      attachments,
      channelId: live.channelId,
      content: content ?? null,
      messageId: live.messageId,
      recoveredFromArchive: live.content === null && content !== undefined,
    },
    subject: { id: live.channelId, kind: "channel" } as const,
    summary: [
      `Сообщение удалено в <#${live.channelId}>.`,
      authorId ? `Автор: <@${authorId}>.` : undefined,
      excerpt(content),
      attachments.length > 0 ? `Вложений: ${attachments.length}.` : undefined,
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n"),
  };
}
