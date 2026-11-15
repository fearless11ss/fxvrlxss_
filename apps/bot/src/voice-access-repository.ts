export type VoiceAccessKind = "trusted" | "banned";

export interface VoiceAccessEntry {
  readonly guildId: string;
  readonly kind: VoiceAccessKind;
  readonly ownerId: string;
  readonly subjectId: string;
}

export interface VoiceAccessRepository {
  list(guildId: string, ownerId: string): Promise<readonly VoiceAccessEntry[]>;
  set(
    guildId: string,
    ownerId: string,
    subjectId: string,
    kind: VoiceAccessKind | null,
  ): Promise<void>;
}
