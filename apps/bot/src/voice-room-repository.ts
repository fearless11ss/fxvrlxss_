export interface VoiceRoomRecord {
  readonly channelId: string;
  readonly guildId: string;
  readonly hidden: boolean;
  readonly locked: boolean;
  readonly ownerId: string;
  readonly userLimit: number;
}

export interface VoiceRoomRepository {
  create(input: VoiceRoomRecord): Promise<VoiceRoomRecord>;
  findByChannel(channelId: string): Promise<VoiceRoomRecord | null>;
  findByOwner(
    guildId: string,
    ownerId: string,
  ): Promise<VoiceRoomRecord | null>;
  listGuild(guildId: string): Promise<readonly VoiceRoomRecord[]>;
  remove(channelId: string): Promise<void>;
  update(
    channelId: string,
    patch: Partial<
      Pick<VoiceRoomRecord, "hidden" | "locked" | "ownerId" | "userLimit">
    >,
  ): Promise<VoiceRoomRecord | null>;
}
