import type { Guild } from "discord.js";

export interface GuildResourceCatalogEntry {
  readonly id: string;
  readonly kind: "channel" | "role";
  readonly name: string;
  readonly parentName?: string;
  readonly position: number;
}

export interface GuildResourceCatalogWriter {
  replace(
    guildId: string,
    entries: readonly GuildResourceCatalogEntry[],
  ): Promise<void>;
}

export function collectGuildResourceCatalog(
  guild: Guild,
): readonly GuildResourceCatalogEntry[] {
  const channels = guild.channels.cache
    .filter((channel) => channel.isTextBased() && !channel.isThread())
    .map((channel) => ({
      id: channel.id,
      kind: "channel" as const,
      name: channel.name,
      ...(channel.parent?.name ? { parentName: channel.parent.name } : {}),
      position: channel.rawPosition,
    }));
  const roles = guild.roles.cache
    .filter((role) => role.id !== guild.id)
    .map((role) => ({
      id: role.id,
      kind: "role" as const,
      name: role.name,
      position: role.position,
    }));

  return [...channels, ...roles];
}
