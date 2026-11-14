export interface ArchivedMessageAttachment {
  readonly contentType?: string | null;
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly url: string;
}

export interface ArchivedMessage {
  readonly attachments: readonly ArchivedMessageAttachment[];
  readonly authorId?: string;
  readonly channelId: string;
  readonly content: string;
  readonly messageId: string;
}

export interface MessageArchiveReader {
  findLatest(
    guildId: string,
    messageId: string,
  ): Promise<ArchivedMessage | null>;
}
