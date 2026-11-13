import { CustomModerationEngine } from "@fxvrlxss/domain/moderation";
import {
  Events,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type Client,
  type ClientEvents,
  type Guild,
  type GuildMember,
  type Message,
  type PartialMessage,
} from "discord.js";
import type { Logger } from "pino";

import { AuditBus, type AuditWriter } from "./audit.js";
import {
  buildLifecycleComponents,
  buildStatusComponents,
  DiscordAuditWriter,
} from "./discord-messages.js";
import {
  resolveGuildResources,
  type GuildResources,
} from "./guild-resources.js";

export interface GuildCore {
  readonly audit: AuditBus;
  stop(): Promise<void>;
}

export interface GuildCoreOptions {
  readonly client: Client;
  readonly databaseConnected: boolean;
  readonly guildId: string;
  readonly logger: Logger;
  readonly persistentWriters?: readonly AuditWriter[];
}

function toModerationMessage(message: Message) {
  return {
    attachments: message.attachments.map((attachment) => ({
      contentType: attachment.contentType,
      name: attachment.name,
      size: attachment.size,
    })),
    channelId: message.channelId,
    content: message.content,
    createdAt: message.createdTimestamp,
    id: message.id,
    userId: message.author.id,
  };
}

function messagePayload(message: Message | PartialMessage) {
  return {
    attachments: message.attachments.map((attachment) => ({
      contentType: attachment.contentType,
      id: attachment.id,
      name: attachment.name,
      size: attachment.size,
      url: attachment.url,
    })),
    channelId: message.channelId,
    content: message.content,
    messageId: message.id,
  };
}

function messageExcerpt(content: string | null | undefined): string {
  if (!content) return "[содержимое недоступно]";
  return content.length > 700 ? `${content.slice(0, 699)}…` : content;
}

async function sendLifecycleMessage(
  client: Client,
  resources: GuildResources,
  kind: "joined" | "left",
  userId: string,
) {
  const channel = await client.channels.fetch(resources.channels.entry);
  if (!channel?.isSendable()) {
    throw new Error("Entry channel is not sendable");
  }
  await channel.send({
    allowedMentions: kind === "joined" ? { users: [userId] } : { parse: [] },
    components: buildLifecycleComponents(kind, userId),
    flags: MessageFlags.IsComponentsV2,
  });
}

function isOwner(member: GuildMember, resources: GuildResources) {
  return member.roles.cache.has(resources.roles.owner);
}

function safeOn<EventName extends keyof ClientEvents>(
  client: Client,
  logger: Logger,
  eventName: EventName,
  listener: (...arguments_: ClientEvents[EventName]) => Promise<void>,
) {
  client.on(eventName, (...arguments_) => {
    void listener(...arguments_).catch((error: unknown) => {
      logger.error({ error, eventName }, "discord event handler failed");
    });
  });
}

async function registerStatusCommand(guild: Guild) {
  const command = new SlashCommandBuilder()
    .setName("статус")
    .setDescription("Показать состояние fxvrlxss_")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
  const commands = await guild.commands.fetch();
  const existing = commands.find(
    (candidate) => candidate.name === command.name,
  );
  if (existing) await guild.commands.edit(existing.id, command);
  else await guild.commands.create(command);
}

export async function startGuildCore(
  options: GuildCoreOptions,
): Promise<GuildCore> {
  const { client, guildId, logger } = options;
  const guild = await client.guilds.fetch(guildId);
  const resources = await resolveGuildResources(guild);
  const discordWriter = new DiscordAuditWriter(client, resources);
  const audit = new AuditBus(
    guildId,
    [...(options.persistentWriters ?? []), discordWriter],
    logger,
  );
  const moderation = new CustomModerationEngine();
  const startedAt = new Date();

  await registerStatusCommand(guild);

  safeOn(client, logger, Events.GuildMemberAdd, async (member) => {
    if (member.guild.id !== guildId || member.user.bot) return;
    try {
      if (!member.roles.cache.has(resources.roles.member)) {
        await member.roles.add(
          resources.roles.member,
          "fxvrlxss_ automatic member onboarding",
        );
      }
      await sendLifecycleMessage(client, resources, "joined", member.id);
      await audit.publish({
        category: "server",
        discord: true,
        eventType: "member.joined",
        payload: {
          accountCreatedAt: member.user.createdAt.toISOString(),
          joinedAt: member.joinedAt?.toISOString(),
        },
        subjectId: member.id,
        summary: `Участнику <@${member.id}> выдана роль \`Участник\`.`,
        title: "Участник присоединился",
      });
    } catch (error) {
      logger.error({ error, userId: member.id }, "member onboarding failed");
      await audit.publish({
        category: "bot",
        discord: true,
        eventType: "member.onboarding_failed",
        payload: { error: String(error) },
        severity: "critical",
        subjectId: member.id,
        summary: "Не удалось завершить автоматическую выдачу роли участника.",
        title: "Ошибка онбординга",
      });
    }
  });

  safeOn(client, logger, Events.GuildMemberRemove, async (member) => {
    if (member.guild.id !== guildId || member.user.bot) return;
    try {
      await sendLifecycleMessage(client, resources, "left", member.id);
    } catch (error) {
      logger.error({ error, userId: member.id }, "leave message failed");
    }
    await audit.publish({
      category: "server",
      discord: true,
      eventType: "member.left",
      subjectId: member.id,
      summary: `<@${member.id}> покинул сервер.`,
      title: "Участник вышел",
    });
  });

  safeOn(client, logger, Events.GuildMemberUpdate, async (before, after) => {
    if (after.guild.id !== guildId) return;
    const addedRoles = after.roles.cache
      .filter((role) => !before.roles.cache.has(role.id))
      .map((role) => role.name);
    const removedRoles = before.roles.cache
      .filter((role) => !after.roles.cache.has(role.id))
      .map((role) => role.name);
    const nicknameChanged = before.nickname !== after.nickname;
    const timeoutChanged =
      before.communicationDisabledUntilTimestamp !==
      after.communicationDisabledUntilTimestamp;
    if (
      addedRoles.length === 0 &&
      removedRoles.length === 0 &&
      !nicknameChanged &&
      !timeoutChanged
    ) {
      return;
    }

    await audit.publish({
      category: timeoutChanged ? "moderation" : "server",
      discord: true,
      eventType: timeoutChanged ? "member.timeout_changed" : "member.updated",
      payload: {
        addedRoles,
        nicknameAfter: after.nickname,
        nicknameBefore: before.nickname,
        removedRoles,
        timeoutAfter: after.communicationDisabledUntil?.toISOString(),
        timeoutBefore: before.communicationDisabledUntil?.toISOString(),
      },
      subjectId: after.id,
      summary: [
        addedRoles.length > 0
          ? `Добавлены роли: ${addedRoles.join(", ")}.`
          : "",
        removedRoles.length > 0
          ? `Сняты роли: ${removedRoles.join(", ")}.`
          : "",
        nicknameChanged ? "Изменён никнейм." : "",
        timeoutChanged ? "Изменён тайм-аут." : "",
      ]
        .filter(Boolean)
        .join(" "),
      title: timeoutChanged ? "Изменён тайм-аут" : "Изменён участник",
    });
  });

  safeOn(client, logger, Events.MessageCreate, async (message) => {
    if (message.guildId !== guildId) return;
    await audit.publish({
      actorId: message.author.id,
      category: "messages",
      discord: false,
      eventType: "message.created",
      payload: messagePayload(message),
      subjectId: message.id,
      summary: "Сообщение сохранено в полном журнале.",
      title: "Создано сообщение",
    });

    if (message.author.bot) return;
    const inspection = moderation.inspect(toModerationMessage(message));
    if (inspection.findings.length === 0) return;
    await audit.publish({
      actorId: message.author.id,
      category: "security",
      discord: true,
      eventType: "moderation.signals_observed",
      payload: {
        channelId: message.channelId,
        findings: inspection.findings,
        messageId: message.id,
      },
      severity: "warning",
      subjectId: message.id,
      summary: `Обнаружено сигналов: ${inspection.findings.length}. Наказание пока не применялось.`,
      title: "Сигналы автомодерации",
    });
  });

  safeOn(client, logger, Events.MessageUpdate, async (before, after) => {
    if (after.guildId !== guildId) return;
    if (
      before.content === after.content &&
      before.attachments.size === after.attachments.size
    ) {
      return;
    }
    await audit.publish({
      actorId: after.author.id,
      category: "messages",
      discord: true,
      eventType: "message.updated",
      payload: {
        after: messagePayload(after),
        before: messagePayload(before),
      },
      subjectId: after.id,
      summary: [
        `Сообщение изменено в <#${after.channelId}>.`,
        `До: ${messageExcerpt(before.content)}`,
        `После: ${messageExcerpt(after.content)}`,
      ].join("\n"),
      title: "Сообщение изменено",
    });
  });

  safeOn(client, logger, Events.MessageDelete, async (message) => {
    if (message.guildId !== guildId) return;
    await audit.publish({
      ...(message.author?.id ? { actorId: message.author.id } : {}),
      category: "messages",
      discord: true,
      eventType: "message.deleted",
      payload: messagePayload(message),
      subjectId: message.id,
      summary: [
        `Сообщение удалено в <#${message.channelId}>.`,
        messageExcerpt(message.content),
      ].join("\n"),
      title: "Сообщение удалено",
    });
  });

  safeOn(
    client,
    logger,
    Events.MessageBulkDelete,
    async (messages, channel) => {
      if (channel.guildId !== guildId) return;
      await audit.publish({
        category: "messages",
        discord: true,
        eventType: "message.bulk_deleted",
        payload: { messageIds: [...messages.keys()] },
        summary: `В <#${channel.id}> массово удалено сообщений: ${messages.size}.`,
        title: "Массовое удаление сообщений",
      });
    },
  );

  safeOn(client, logger, Events.GuildBanAdd, async (ban) => {
    if (ban.guild.id !== guildId) return;
    await audit.publish({
      category: "moderation",
      discord: true,
      eventType: "member.banned",
      payload: { reason: ban.reason },
      subjectId: ban.user.id,
      summary: `<@${ban.user.id}> заблокирован на сервере.`,
      title: "Участник заблокирован",
    });
  });

  safeOn(client, logger, Events.GuildBanRemove, async (ban) => {
    if (ban.guild.id !== guildId) return;
    await audit.publish({
      category: "moderation",
      discord: true,
      eventType: "member.unbanned",
      subjectId: ban.user.id,
      summary: `Блокировка <@${ban.user.id}> снята.`,
      title: "Блокировка снята",
    });
  });

  safeOn(
    client,
    logger,
    Events.AutoModerationActionExecution,
    async (execution) => {
      if (execution.guild.id !== guildId) return;
      await audit.publish({
        category: "moderation",
        discord: true,
        eventType: "discord_automod.executed",
        payload: {
          actionType: execution.action.type,
          channelId: execution.channel?.id,
          ruleId: execution.ruleId,
        },
        subjectId: execution.userId,
        summary: `Discord AutoMod применил действие к <@${execution.userId}>.`,
        title: "Сработал Discord AutoMod",
      });
    },
  );

  safeOn(client, logger, Events.VoiceStateUpdate, async (before, after) => {
    if (after.guild.id !== guildId || before.channelId === after.channelId)
      return;
    await audit.publish({
      actorId: after.id,
      category: "server",
      discord: false,
      eventType: "voice.channel_changed",
      payload: {
        channelAfter: after.channelId,
        channelBefore: before.channelId,
      },
      subjectId: after.id,
      summary: "Изменено подключение к голосовому каналу.",
      title: "Голосовой канал изменён",
    });
  });

  safeOn(client, logger, Events.ChannelCreate, async (channel) => {
    if (!channel.isDMBased() && channel.guild.id === guildId) {
      await audit.publish({
        category: "server",
        discord: true,
        eventType: "channel.created",
        payload: {
          channelId: channel.id,
          name: channel.name,
          type: channel.type,
        },
        subjectId: channel.id,
        summary: `Создан канал \`${channel.name}\`.`,
        title: "Канал создан",
      });
    }
  });

  safeOn(client, logger, Events.ChannelDelete, async (channel) => {
    if (!channel.isDMBased() && channel.guild.id === guildId) {
      await audit.publish({
        category: "server",
        discord: true,
        eventType: "channel.deleted",
        payload: {
          channelId: channel.id,
          name: channel.name,
          type: channel.type,
        },
        subjectId: channel.id,
        summary: `Удалён канал \`${channel.name}\`.`,
        title: "Канал удалён",
      });
    }
  });

  safeOn(client, logger, Events.ChannelUpdate, async (before, after) => {
    if (before.isDMBased() || after.isDMBased() || after.guild.id !== guildId)
      return;
    await audit.publish({
      category: "server",
      discord: true,
      eventType: "channel.updated",
      payload: {
        after: {
          name: after.name,
          parentId: after.parentId,
          position: after.position,
          type: after.type,
        },
        before: {
          name: before.name,
          parentId: before.parentId,
          position: before.position,
          type: before.type,
        },
      },
      subjectId: after.id,
      summary: `Изменён канал \`${before.name}\` → \`${after.name}\`.`,
      title: "Канал изменён",
    });
  });

  safeOn(client, logger, Events.GuildRoleCreate, async (role) => {
    if (role.guild.id !== guildId) return;
    await audit.publish({
      category: "server",
      discord: true,
      eventType: "role.created",
      payload: { permissions: role.permissions.bitfield.toString() },
      subjectId: role.id,
      summary: `Создана роль \`${role.name}\`.`,
      title: "Роль создана",
    });
  });

  safeOn(client, logger, Events.GuildRoleDelete, async (role) => {
    if (role.guild.id !== guildId) return;
    await audit.publish({
      category: "server",
      discord: true,
      eventType: "role.deleted",
      payload: { permissions: role.permissions.bitfield.toString() },
      subjectId: role.id,
      summary: `Удалена роль \`${role.name}\`.`,
      title: "Роль удалена",
    });
  });

  safeOn(client, logger, Events.GuildRoleUpdate, async (before, after) => {
    if (after.guild.id !== guildId) return;
    await audit.publish({
      category: "server",
      discord: true,
      eventType: "role.updated",
      payload: {
        after: {
          color: after.hexColor,
          hoist: after.hoist,
          name: after.name,
          permissions: after.permissions.bitfield.toString(),
          position: after.position,
        },
        before: {
          color: before.hexColor,
          hoist: before.hoist,
          name: before.name,
          permissions: before.permissions.bitfield.toString(),
          position: before.position,
        },
      },
      subjectId: after.id,
      summary: `Изменена роль \`${before.name}\` → \`${after.name}\`.`,
      title: "Роль изменена",
    });
  });

  safeOn(client, logger, Events.InviteCreate, async (invite) => {
    if (invite.guild?.id !== guildId) return;
    await audit.publish({
      ...(invite.inviter?.id ? { actorId: invite.inviter.id } : {}),
      category: "security",
      discord: true,
      eventType: "invite.created",
      payload: {
        channelId: invite.channel?.id,
        code: invite.code,
        maxAge: invite.maxAge,
        maxUses: invite.maxUses,
        temporary: invite.temporary,
      },
      summary: `Создано приглашение \`${invite.code}\`.`,
      title: "Приглашение создано",
    });
  });

  safeOn(client, logger, Events.InviteDelete, async (invite) => {
    if (invite.guild?.id !== guildId) return;
    await audit.publish({
      category: "security",
      discord: true,
      eventType: "invite.deleted",
      payload: { channelId: invite.channel?.id, code: invite.code },
      summary: `Удалено приглашение \`${invite.code}\`.`,
      title: "Приглашение удалено",
    });
  });

  safeOn(client, logger, Events.InteractionCreate, async (interaction) => {
    if (interaction.guildId !== guildId) return;
    const isStatusCommand =
      interaction.isChatInputCommand() && interaction.commandName === "статус";
    const isStatusRefresh =
      interaction.isButton() && interaction.customId === "core:status:refresh";
    if (!isStatusCommand && !isStatusRefresh) return;

    const member = await guild.members.fetch(interaction.user.id);
    if (!isOwner(member, resources)) {
      if (interaction.isRepliable()) {
        await interaction.reply({
          content: "Эта команда доступна только владельцу.",
          flags: MessageFlags.Ephemeral,
        });
      }
      return;
    }

    const components = buildStatusComponents({
      database: options.databaseConnected,
      guildId,
      ping: client.ws.ping,
      startedAt,
    });
    if (interaction.isButton()) {
      await interaction.update({ components });
    } else {
      await interaction.reply({
        allowedMentions: { parse: [] },
        components,
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      });
    }
  });

  await audit.publish({
    category: "bot",
    discord: true,
    eventType: "bot.ready",
    payload: { databaseConnected: options.databaseConnected },
    summary: "Ресурсы сервера разрешены, обработчики событий запущены.",
    title: "fxvrlxss_ запущен",
  });

  return {
    audit,
    async stop() {
      await audit.publish({
        category: "bot",
        discord: true,
        eventType: "bot.stopping",
        summary: "Получен сигнал штатного завершения.",
        title: "fxvrlxss_ останавливается",
      });
      await audit.drain();
    },
  };
}
