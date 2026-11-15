export type TicketState = "claimed" | "closed" | "open" | "reopened";

export interface TicketRecord {
  readonly assignedToId: string | null;
  readonly authorId: string;
  readonly channelId: string;
  readonly channelDeletedAt: Date | null;
  readonly controlMessageId: string | null;
  readonly description: string;
  readonly id: string;
  readonly moderationCaseNumber: number | null;
  readonly number: number;
  readonly participantIds: readonly string[];
  readonly status: TicketState;
  readonly subject: string;
  readonly type: string;
}

export type TicketReservation =
  | { readonly reason: "duplicate-type" | "limit"; readonly success: false }
  | { readonly record: TicketRecord; readonly success: true };

export interface TicketTranscriptEntry {
  readonly attachments: readonly {
    readonly name: string;
    readonly size: number;
    readonly url: string;
  }[];
  readonly authorBot: boolean;
  readonly authorId: string;
  readonly authorName: string;
  readonly components: readonly unknown[];
  readonly content: string;
  readonly createdAt: string;
  readonly editedAt: string | null;
  readonly embeds: readonly unknown[];
  readonly messageId: string;
  readonly referencedMessageId: string | null;
  readonly stickers: readonly {
    readonly id: string;
    readonly name: string;
    readonly url: string;
  }[];
}

export interface TicketRepository {
  abandon(id: string): Promise<void>;
  activate(id: string, channelId: string): Promise<TicketRecord>;
  claim(channelId: string, staffId: string): Promise<TicketRecord | null>;
  close(
    channelId: string,
    reason: string,
    transcript: readonly TicketTranscriptEntry[] | null,
  ): Promise<TicketRecord | null>;
  findByChannel(channelId: string): Promise<TicketRecord | null>;
  findClosedWithChannels(guildId: string): Promise<readonly TicketRecord[]>;
  findInactive(guildId: string, before: Date): Promise<readonly TicketRecord[]>;
  markChannelDeleted(channelId: string): Promise<TicketRecord | null>;
  reopen(channelId: string): Promise<TicketRecord | null>;
  reserve(input: {
    readonly authorId: string;
    readonly description: string;
    readonly guildId: string;
    readonly maxOpenTickets: number;
    readonly moderationCaseNumber?: number;
    readonly subject: string;
    readonly type: string;
  }): Promise<TicketReservation>;
  setControlMessage(
    channelId: string,
    messageId: string,
  ): Promise<TicketRecord | null>;
  setParticipants(
    channelId: string,
    participantIds: readonly string[],
  ): Promise<TicketRecord | null>;
  touch(channelId: string): Promise<void>;
}
