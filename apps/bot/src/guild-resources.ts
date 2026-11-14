import { ChannelType, type Guild } from "discord.js";

export interface GuildResources {
  readonly channels: {
    readonly entry: string;
    readonly general: {
      readonly botCommands: string;
    };
    readonly logs: Readonly<
      Record<"security" | "moderation" | "messages" | "server" | "bot", string>
    >;
    readonly support: {
      readonly category: string;
      readonly openTicket: string;
    };
    readonly team: {
      readonly ticketDiscussions: string;
    };
    readonly voice: {
      readonly category: string;
      readonly createRoom: string;
    };
  };
  readonly roles: {
    readonly member: string;
    readonly owner: string;
    readonly quarantine: string;
  };
}

function requireRole(guild: Guild, name: string): string {
  const role = guild.roles.cache.find((candidate) => candidate.name === name);
  if (!role) throw new Error(`Required Discord role is missing: ${name}`);
  return role.id;
}

function requireTextChannel(
  guild: Guild,
  name: string,
  parentName?: string,
): string {
  const parent = parentName
    ? guild.channels.cache.find(
        (candidate) =>
          candidate.type === ChannelType.GuildCategory &&
          candidate.name === parentName,
      )
    : undefined;
  if (parentName && !parent) {
    throw new Error(`Required Discord category is missing: ${parentName}`);
  }

  const channel = guild.channels.cache.find(
    (candidate) =>
      candidate.type === ChannelType.GuildText &&
      candidate.name === name &&
      candidate.parentId === (parent?.id ?? null),
  );
  if (!channel) {
    throw new Error(
      `Required Discord text channel is missing: ${parentName ? `${parentName}/` : ""}${name}`,
    );
  }
  return channel.id;
}

function requireVoiceChannel(
  guild: Guild,
  name: string,
  parentName: string,
): string {
  const parent = guild.channels.cache.find(
    (candidate) =>
      candidate.type === ChannelType.GuildCategory &&
      candidate.name === parentName,
  );
  if (!parent) {
    throw new Error(`Required Discord category is missing: ${parentName}`);
  }
  const channel = guild.channels.cache.find(
    (candidate) =>
      candidate.type === ChannelType.GuildVoice &&
      candidate.name === name &&
      candidate.parentId === parent.id,
  );
  if (!channel) {
    throw new Error(
      `Required Discord voice channel is missing: ${parentName}/${name}`,
    );
  }
  return channel.id;
}

function requireCategory(guild: Guild, name: string): string {
  const category = guild.channels.cache.find(
    (candidate) =>
      candidate.type === ChannelType.GuildCategory && candidate.name === name,
  );
  if (!category)
    throw new Error(`Required Discord category is missing: ${name}`);
  return category.id;
}

export async function resolveGuildResources(
  guild: Guild,
): Promise<GuildResources> {
  await Promise.all([guild.channels.fetch(), guild.roles.fetch()]);
  return {
    channels: {
      entry: requireTextChannel(guild, "прихожая"),
      general: {
        botCommands: requireTextChannel(guild, "команды-бота", "ОБЩЕНИЕ"),
      },
      logs: {
        security: requireTextChannel(guild, "безопасность", "ЛОГИ"),
        moderation: requireTextChannel(guild, "модерация", "ЛОГИ"),
        messages: requireTextChannel(guild, "сообщения", "ЛОГИ"),
        server: requireTextChannel(guild, "сервер", "ЛОГИ"),
        bot: requireTextChannel(guild, "бот", "ЛОГИ"),
      },
      support: {
        category: requireCategory(guild, "ПОДДЕРЖКА"),
        openTicket: requireTextChannel(guild, "открыть-тикет", "ПОДДЕРЖКА"),
      },
      team: {
        ticketDiscussions: requireTextChannel(
          guild,
          "обсуждение-обращений",
          "КОМАНДА",
        ),
      },
      voice: {
        category: requireCategory(guild, "ГОЛОСОВЫЕ"),
        createRoom: requireVoiceChannel(guild, "создать-комнату", "ГОЛОСОВЫЕ"),
      },
    },
    roles: {
      member: requireRole(guild, "Участник"),
      owner: requireRole(guild, "Владелец"),
      quarantine: requireRole(guild, "Карантин"),
    },
  };
}
