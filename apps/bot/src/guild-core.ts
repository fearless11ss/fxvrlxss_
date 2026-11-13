import {
  AutoModerationActionType,
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
import { AsyncEventGate } from "./async-event-gate.js";
import { automodActionLabel, buildAutomodLogSummary } from "./automod-log.js";
import type { AutomodPublicationRepository } from "./automod-publication.js";
import { AutomodPublicationWorker } from "./automod-publication.js";
import { AutomodRuntime } from "./automod-runtime.js";
import {
  buildLifecycleComponents,
  buildStatusComponents,
  DiscordAuditWriter,
} from "./discord-messages.js";
import { DiscordAutomodAdapter } from "./discord-automod.js";
import {
  resolveGuildResources,
  type GuildResources,
} from "./guild-resources.js";
import {
  collectGuildResourceCatalog,
  type GuildResourceCatalogWriter,
} from "./guild-resource-catalog.js";

export interface GuildCore {
  readonly audit: AuditBus;
  stop(): Promise<void>;
}

export interface GuildCoreOptions {
  readonly automodPublicationRepository?: AutomodPublicationRepository;
  readonly client: Client;
  readonly databaseConnected: boolean;
  readonly guildId: string;
  readonly guildResourceCatalogWriter?: GuildResourceCatalogWriter;
  readonly logger: Logger;
  readonly persistentWriters?: readonly AuditWriter[];
}

function isAutomodExempt(message: Message, runtime: AutomodRuntime): boolean {
  const member = message.member;
  return (
    runtime.config.exemptChannelIds.includes(message.channelId) ||
    Boolean(
      member?.permissions.has(PermissionFlagsBits.Administrator) ||
      member?.permissions.has(PermissionFlagsBits.ManageMessages) ||
      member?.roles.cache.some((role) =>
        runtime.config.exemptRoleIds.includes(role.id),
      ),
    )
  );
}

async function applyCustomSanction(
  message: Message,
  action: "ban" | "delete" | "kick" | "quarantine" | "timeout",
  timeoutMinutes: number,
  quarantineRoleId: string,
) {
  const reason = `fxvrlxss_ automod: ${action}`;
  if (action === "timeout" && !message.member?.moderatable) {
    throw new Error("Matched member cannot be timed out by the bot");
  }
  if (action === "quarantine" && !message.member?.manageable) {
    throw new Error("Matched member cannot be quarantined by the bot");
  }
  if (action === "kick" && !message.member?.kickable) {
    throw new Error("Matched member cannot be kicked by the bot");
  }
  if (action === "ban" && !message.member?.bannable) {
    throw new Error("Matched member cannot be banned by the bot");
  }
  if (!message.deletable) {
    throw new Error("Matched message cannot be deleted by the bot");
  }
  await message.delete();
  if (action === "timeout") {
    await message.member?.timeout(timeoutMinutes * 60_000, reason);
  }
  if (action === "quarantine") {
    await message.member?.roles.add(quarantineRoleId, reason);
  }
  if (action === "kick") {
    await message.member?.kick(reason);
  }
  if (action === "ban") {
    await message.member?.ban({ reason });
  }
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

function discordAutomodActionLabel(action: AutoModerationActionType): string {
  switch (action) {
    case AutoModerationActionType.BlockMemberInteraction:
      return "взаимодействия участника заблокированы";
    case AutoModerationActionType.BlockMessage:
      return "сообщение заблокировано";
    case AutoModerationActionType.SendAlertMessage:
      return "отправлено предупреждение в журнал";
    case AutoModerationActionType.Timeout:
      return "участнику выдан тайм-аут";
  }
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
  if (kind === "left") {
    await channel.send({
      allowedMentions: { parse: [] },
      components: buildLifecycleComponents(kind, userId),
      flags: MessageFlags.IsComponentsV2,
    });
    return;
  }

  // Mentions inside Components V2 are visual only. Send ordinary content so
  // Discord creates the notification, then convert the same message to V2.
  const welcome = await channel.send({
    allowedMentions: { users: [userId] },
    content: `<@${userId}>`,
  });
  await new Promise((resolve) => setTimeout(resolve, 750));
  await welcome.edit({
    allowedMentions: { parse: [] },
    components: buildLifecycleComponents(kind, userId),
    content: null,
    flags: MessageFlags.IsComponentsV2,
  });
}

function isOwner(member: GuildMember, resources: GuildResources) {
  return member.roles.cache.has(resources.roles.owner);
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
  const eventGate = new AsyncEventGate((error) => {
    logger.error({ error }, "discord event gate failed");
  });
  const safeOn = <EventName extends keyof ClientEvents>(
    eventName: EventName,
    listener: (...arguments_: ClientEvents[EventName]) => Promise<void>,
  ) => {
    client.on(eventName, (...arguments_) => {
      eventGate.run(async () => {
        try {
          await listener(...arguments_);
        } catch (error) {
          logger.error({ error, eventName }, "discord event handler failed");
        }
      });
    });
  };
  const guild = await client.guilds.fetch(guildId);
  const resources = await resolveGuildResources(guild);
  const refreshGuildResourceCatalog = async () => {
    await options.guildResourceCatalogWriter?.replace(
      guildId,
      collectGuildResourceCatalog(guild),
    );
  };
  await refreshGuildResourceCatalog();
  const automodRuntime = new AutomodRuntime();
  const discordAutomod = new DiscordAutomodAdapter(
    guild,
    resources,
    automodRuntime,
  );
  const publicationWorker = options.automodPublicationRepository
    ? new AutomodPublicationWorker({
        applier: discordAutomod,
        logger,
        repository: options.automodPublicationRepository,
      })
    : undefined;
  const discordWriter = new DiscordAuditWriter(client, resources);
  const audit = new AuditBus(
    guildId,
    [...(options.persistentWriters ?? []), discordWriter],
    logger,
  );
  const startedAt = new Date();

  await registerStatusCommand(guild);
  await publicationWorker?.start();

  safeOn(Events.GuildMemberAdd, async (member) => {
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
        subject: { id: member.id, kind: "user" },
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
        subject: { id: member.id, kind: "user" },
        summary: "Не удалось завершить автоматическую выдачу роли участника.",
        title: "Ошибка онбординга",
      });
    }
  });

  safeOn(Events.GuildMemberRemove, async (member) => {
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
      subject: { id: member.id, kind: "user" },
      summary: `<@${member.id}> покинул сервер.`,
      title: "Участник вышел",
    });
  });

  safeOn(Events.GuildMemberUpdate, async (before, after) => {
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
      subject: { id: after.id, kind: "user" },
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

  safeOn(Events.MessageCreate, async (message) => {
    if (message.guildId !== guildId) return;
    await audit.publish({
      actor: { id: message.author.id, kind: "user" },
      category: "messages",
      discord: false,
      eventType: "message.created",
      payload: messagePayload(message),
      subject: {
        channelId: message.channelId,
        id: message.id,
        kind: "message",
      },
      summary: "Сообщение сохранено в полном журнале.",
      title: "Создано сообщение",
    });

    if (message.author.bot || isAutomodExempt(message, automodRuntime)) return;
    const decision = automodRuntime.inspect(toModerationMessage(message));
    if (decision.findings.length === 0) return;
    await audit.publish({
      actor: { id: message.author.id, kind: "user" },
      category: "security",
      discord: true,
      eventType: "moderation.signals_observed",
      payload: {
        channelId: message.channelId,
        action: decision.action,
        findings: decision.findings,
        messageId: message.id,
      },
      severity: "warning",
      subject: {
        channelId: message.channelId,
        id: message.id,
        kind: "message",
      },
      summary: buildAutomodLogSummary(
        automodRuntime.config,
        decision,
        message.channelId,
      ),
      title: "Сработала автомодерация",
    });
    if (decision.action === "observe") return;
    try {
      await applyCustomSanction(
        message,
        decision.action,
        decision.timeoutMinutes,
        resources.roles.quarantine,
      );
      await audit.publish({
        category: "moderation",
        discord: true,
        eventType: "moderation.action_applied",
        payload: {
          action: decision.action,
          findings: decision.findings,
          messageId: message.id,
        },
        severity: "warning",
        subject: { id: message.author.id, kind: "user" },
        summary: buildAutomodLogSummary(
          automodRuntime.config,
          decision,
          message.channelId,
        ),
        title: "Автомодерация применила действие",
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await audit.publish({
        category: "bot",
        discord: true,
        eventType: "moderation.action_failed",
        payload: { action: decision.action, error: reason },
        severity: "critical",
        subject: { id: message.author.id, kind: "user" },
        summary: [
          `Участник: <@${message.author.id}>`,
          `Канал: <#${message.channelId}>`,
          `Не удалось применить действие: ${automodActionLabel(decision.action, decision.timeoutMinutes)}.`,
          `Причина: ${reason}`,
        ].join("\n"),
        title: "Ошибка автомодерации",
      });
    }
  });

  safeOn(Events.MessageUpdate, async (before, after) => {
    if (after.guildId !== guildId) return;
    if (
      before.content === after.content &&
      before.attachments.size === after.attachments.size
    ) {
      return;
    }
    await audit.publish({
      actor: { id: after.author.id, kind: "user" },
      category: "messages",
      discord: true,
      eventType: "message.updated",
      payload: {
        after: messagePayload(after),
        before: messagePayload(before),
      },
      subject: {
        channelId: after.channelId,
        id: after.id,
        kind: "message",
      },
      summary: [
        `Сообщение изменено в <#${after.channelId}>.`,
        `До: ${messageExcerpt(before.content)}`,
        `После: ${messageExcerpt(after.content)}`,
      ].join("\n"),
      title: "Сообщение изменено",
    });
  });

  safeOn(Events.MessageDelete, async (message) => {
    if (message.guildId !== guildId) return;
    await audit.publish({
      ...(message.author?.id
        ? { actor: { id: message.author.id, kind: "user" } as const }
        : {}),
      category: "messages",
      discord: true,
      eventType: "message.deleted",
      payload: messagePayload(message),
      subject: {
        channelId: message.channelId,
        id: message.id,
        kind: "message",
      },
      summary: [
        `Сообщение удалено в <#${message.channelId}>.`,
        messageExcerpt(message.content),
      ].join("\n"),
      title: "Сообщение удалено",
    });
  });

  safeOn(Events.MessageBulkDelete, async (messages, channel) => {
    if (channel.guildId !== guildId) return;
    await audit.publish({
      category: "messages",
      discord: true,
      eventType: "message.bulk_deleted",
      payload: { messageIds: [...messages.keys()] },
      summary: `В <#${channel.id}> массово удалено сообщений: ${messages.size}.`,
      title: "Массовое удаление сообщений",
    });
  });

  safeOn(Events.GuildBanAdd, async (ban) => {
    if (ban.guild.id !== guildId) return;
    await audit.publish({
      category: "moderation",
      discord: true,
      eventType: "member.banned",
      payload: { reason: ban.reason },
      subject: { id: ban.user.id, kind: "user" },
      summary: `<@${ban.user.id}> заблокирован на сервере.`,
      title: "Участник заблокирован",
    });
  });

  safeOn(Events.GuildBanRemove, async (ban) => {
    if (ban.guild.id !== guildId) return;
    await audit.publish({
      category: "moderation",
      discord: true,
      eventType: "member.unbanned",
      subject: { id: ban.user.id, kind: "user" },
      summary: `Блокировка <@${ban.user.id}> снята.`,
      title: "Блокировка снята",
    });
  });

  safeOn(Events.AutoModerationActionExecution, async (execution) => {
    if (execution.guild.id !== guildId) return;
    const inviteAction = automodRuntime.config.inviteLinks.action;
    const managedInviteRule = discordAutomod.isManagedInviteRule(
      execution.ruleId,
    );
    if (
      managedInviteRule &&
      automodRuntime.config.enabled &&
      automodRuntime.config.mode === "enforce" &&
      ["ban", "kick", "quarantine"].includes(inviteAction)
    ) {
      const member = await guild.members.fetch(execution.userId);
      const reason = `fxvrlxss_ Discord invite automod: ${inviteAction}`;
      if (inviteAction === "quarantine") {
        await member.roles.add(resources.roles.quarantine, reason);
      } else if (inviteAction === "kick") {
        await member.kick(reason);
      } else if (inviteAction === "ban") {
        await member.ban({ reason });
      }
    }
    await audit.publish({
      actor: { id: execution.userId, kind: "user" },
      category: "moderation",
      discord: true,
      eventType: "discord_automod.executed",
      payload: {
        actionType: execution.action.type,
        channelId: execution.channel?.id,
        ruleId: execution.ruleId,
      },
      subject:
        execution.messageId && execution.channelId
          ? {
              channelId: execution.channelId,
              id: execution.messageId,
              kind: "message",
            }
          : { id: execution.userId, kind: "user" },
      summary: [
        `Участник: <@${execution.userId}>`,
        execution.channelId ? `Канал: <#${execution.channelId}>` : undefined,
        `Правило: ${managedInviteRule ? "сторонние приглашения Discord" : (execution.autoModerationRule?.name ?? "Discord AutoMod")}.`,
        `Событие: ${discordAutomodActionLabel(execution.action.type)}.`,
        managedInviteRule
          ? `Настройка fxvrlxss_: ${automodActionLabel(inviteAction, automodRuntime.config.inviteLinks.timeoutMinutes)}.`
          : undefined,
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n"),
      title: managedInviteRule
        ? "Обнаружено стороннее приглашение"
        : "Сработал Discord AutoMod",
    });
  });

  safeOn(Events.VoiceStateUpdate, async (before, after) => {
    if (after.guild.id !== guildId || before.channelId === after.channelId)
      return;
    await audit.publish({
      actor: { id: after.id, kind: "user" },
      category: "server",
      discord: false,
      eventType: "voice.channel_changed",
      payload: {
        channelAfter: after.channelId,
        channelBefore: before.channelId,
      },
      subject: { id: after.id, kind: "user" },
      summary: "Изменено подключение к голосовому каналу.",
      title: "Голосовой канал изменён",
    });
  });

  safeOn(Events.ChannelCreate, async (channel) => {
    if (!channel.isDMBased() && channel.guild.id === guildId) {
      await refreshGuildResourceCatalog();
      await audit.publish({
        category: "server",
        discord: true,
        eventType: "channel.created",
        payload: {
          channelId: channel.id,
          name: channel.name,
          type: channel.type,
        },
        subject: { id: channel.id, kind: "channel" },
        summary: `Создан канал \`${channel.name}\`.`,
        title: "Канал создан",
      });
    }
  });

  safeOn(Events.ChannelDelete, async (channel) => {
    if (!channel.isDMBased() && channel.guild.id === guildId) {
      await refreshGuildResourceCatalog();
      await audit.publish({
        category: "server",
        discord: true,
        eventType: "channel.deleted",
        payload: {
          channelId: channel.id,
          name: channel.name,
          type: channel.type,
        },
        subject: { id: channel.id, kind: "channel" },
        summary: `Удалён канал \`${channel.name}\`.`,
        title: "Канал удалён",
      });
    }
  });

  safeOn(Events.ChannelUpdate, async (before, after) => {
    if (before.isDMBased() || after.isDMBased() || after.guild.id !== guildId)
      return;
    await refreshGuildResourceCatalog();
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
      subject: { id: after.id, kind: "channel" },
      summary: `Изменён канал \`${before.name}\` → \`${after.name}\`.`,
      title: "Канал изменён",
    });
  });

  safeOn(Events.GuildRoleCreate, async (role) => {
    if (role.guild.id !== guildId) return;
    await refreshGuildResourceCatalog();
    await audit.publish({
      category: "server",
      discord: true,
      eventType: "role.created",
      payload: { permissions: role.permissions.bitfield.toString() },
      subject: { id: role.id, kind: "role" },
      summary: `Создана роль \`${role.name}\`.`,
      title: "Роль создана",
    });
  });

  safeOn(Events.GuildRoleDelete, async (role) => {
    if (role.guild.id !== guildId) return;
    await refreshGuildResourceCatalog();
    await audit.publish({
      category: "server",
      discord: true,
      eventType: "role.deleted",
      payload: { permissions: role.permissions.bitfield.toString() },
      subject: { id: role.id, kind: "role" },
      summary: `Удалена роль \`${role.name}\`.`,
      title: "Роль удалена",
    });
  });

  safeOn(Events.GuildRoleUpdate, async (before, after) => {
    if (after.guild.id !== guildId) return;
    await refreshGuildResourceCatalog();
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
      subject: { id: after.id, kind: "role" },
      summary: `Изменена роль \`${before.name}\` → \`${after.name}\`.`,
      title: "Роль изменена",
    });
  });

  safeOn(Events.InviteCreate, async (invite) => {
    if (invite.guild?.id !== guildId) return;
    await audit.publish({
      ...(invite.inviter?.id
        ? { actor: { id: invite.inviter.id, kind: "user" } as const }
        : {}),
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
      ...(invite.channel?.id
        ? { subject: { id: invite.channel.id, kind: "channel" } as const }
        : {}),
      summary: `Создано приглашение \`${invite.code}\`.`,
      title: "Приглашение создано",
    });
  });

  safeOn(Events.InviteDelete, async (invite) => {
    if (invite.guild?.id !== guildId) return;
    await audit.publish({
      category: "security",
      discord: true,
      eventType: "invite.deleted",
      payload: { channelId: invite.channel?.id, code: invite.code },
      ...(invite.channel?.id
        ? { subject: { id: invite.channel.id, kind: "channel" } as const }
        : {}),
      summary: `Удалено приглашение \`${invite.code}\`.`,
      title: "Приглашение удалено",
    });
  });

  safeOn(Events.InteractionCreate, async (interaction) => {
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
      await publicationWorker?.stop();
      await eventGate.close();
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
