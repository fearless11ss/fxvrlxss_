import type { Guild, GuildBasedChannel, GuildMember, Role } from "discord.js";

export interface GuildResourceCatalogEntry {
  readonly id: string;
  readonly kind: "channel" | "member" | "role";
  readonly name: string;
  readonly parentName?: string;
  readonly position: number;
}

export interface GuildResourceCatalogWriter {
  replace(
    guildId: string,
    entries: readonly GuildResourceCatalogEntry[],
  ): Promise<void>;
  remove(
    guildId: string,
    kind: GuildResourceCatalogEntry["kind"],
    resourceId: string,
  ): Promise<void>;
  upsert(guildId: string, entry: GuildResourceCatalogEntry): Promise<void>;
}

export function channelCatalogEntry(
  channel: GuildBasedChannel,
): GuildResourceCatalogEntry | null {
  if (!channel.isTextBased() || channel.isThread()) return null;
  return {
    id: channel.id,
    kind: "channel",
    name: channel.name,
    ...(channel.parent?.name ? { parentName: channel.parent.name } : {}),
    position: channel.rawPosition,
  };
}

export function memberCatalogEntry(
  member: GuildMember,
): GuildResourceCatalogEntry {
  return {
    id: member.id,
    kind: "member",
    name: member.displayName,
    ...(member.user.username !== member.displayName
      ? { parentName: member.user.username }
      : {}),
    position: member.roles.highest.position,
  };
}

export function roleCatalogEntry(role: Role): GuildResourceCatalogEntry | null {
  if (role.id === role.guild.id) return null;
  return {
    id: role.id,
    kind: "role",
    name: role.name,
    position: role.position,
  };
}

export function collectGuildResourceCatalog(
  guild: Guild,
): readonly GuildResourceCatalogEntry[] {
  const channels = guild.channels.cache
    .map(channelCatalogEntry)
    .filter((entry): entry is GuildResourceCatalogEntry => entry !== null);
  const members = guild.members.cache.map(memberCatalogEntry);
  const roles = guild.roles.cache
    .map(roleCatalogEntry)
    .filter((entry): entry is GuildResourceCatalogEntry => entry !== null);

  return [...channels, ...roles, ...members];
}
