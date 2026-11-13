import { REST, Routes } from "discord.js";

export interface GuildInventory {
  readonly bans: number;
  readonly channels: number;
  readonly emojis: number;
  readonly fetchedAt: string;
  readonly guildId: string;
  readonly invites: number;
  readonly roles: readonly {
    readonly id: string;
    readonly managed: boolean;
    readonly name: string;
  }[];
  readonly stickers: number;
  readonly webhooks: number;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value))
    throw new Error(`Discord returned a non-array ${label} response`);
  return value;
}

function asRole(value: unknown): GuildInventory["roles"][number] {
  if (
    typeof value !== "object" ||
    value === null ||
    !("id" in value) ||
    !("name" in value) ||
    !("managed" in value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.managed !== "boolean"
  ) {
    throw new Error("Discord returned an invalid role object");
  }
  return { id: value.id, managed: value.managed, name: value.name };
}

export async function inventoryGuild(
  token: string,
  guildId: string,
): Promise<GuildInventory> {
  const rest = new REST({ version: "10" }).setToken(token);
  const [channels, roles, emojis, stickers, webhooks, invites, bans] =
    await Promise.all([
      rest.get(Routes.guildChannels(guildId)),
      rest.get(Routes.guildRoles(guildId)),
      rest.get(Routes.guildEmojis(guildId)),
      rest.get(Routes.guildStickers(guildId)),
      rest.get(Routes.guildWebhooks(guildId)),
      rest.get(Routes.guildInvites(guildId)),
      rest.get(Routes.guildBans(guildId), {
        query: new URLSearchParams({ limit: "1000" }),
      }),
    ]);

  return {
    bans: asArray(bans, "bans").length,
    channels: asArray(channels, "channels").length,
    emojis: asArray(emojis, "emojis").length,
    fetchedAt: new Date().toISOString(),
    guildId,
    invites: asArray(invites, "invites").length,
    roles: asArray(roles, "roles").map(asRole),
    stickers: asArray(stickers, "stickers").length,
    webhooks: asArray(webhooks, "webhooks").length,
  };
}
