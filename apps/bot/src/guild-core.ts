import { setTimeout as delay } from "node:timers/promises";

import {
  AuditLogEvent,
  AutoModerationActionType,
  ChannelType,
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
import {
  automodActionLabel,
  automodSignalLabel,
  buildAutomodLogSummary,
} from "./automod-log.js";
import type { AutomodPublicationRepository } from "./automod-publication.js";
import { AutomodPublicationWorker } from "./automod-publication.js";
import { AutomodRuntime } from "./automod-runtime.js";
import { AutomodSignalLogGate } from "./automod-signal-log-gate.js";
import {
  describeChannelUpdate,
  type ChannelUpdateSnapshot,
} from "./channel-update-log.js";
import {
  buildLifecycleComponents,
  buildStatusComponents,
  buildWelcomeEmbed,
  DiscordAuditWriter,
} from "./discord-messages.js";
import { DiscordAutomodAdapter } from "./discord-automod.js";
import { buildDiscordAutomodSourceEventKey } from "./discord-automod-event.js";
import { buildDeletedMessageLog } from "./deleted-message-log.js";
import {
  resolveGuildResources,
  type GuildResources,
} from "./guild-resources.js";
import {
  channelCatalogEntry,
  collectGuildResourceCatalog,
  memberCatalogEntry,
  roleCatalogEntry,
  type GuildResourceCatalogEntry,
  type GuildResourceCatalogWriter,
} from "./guild-resource-catalog.js";
import type { MessageArchiveReader } from "./message-archive.js";
import {
  describeMemberRoleChange,
  findMemberRoleAuditContext,
  type MemberRoleAuditContext,
  type MemberRoleReference,
} from "./member-role-log.js";
import {
  describeMemberTimeoutChange,
  describeNaturalMemberTimeoutExpiry,
  findMemberTimeoutAuditContext,
  type MemberTimeoutAuditContext,
} from "./member-timeout-log.js";
import { MemberTimeoutExpiryTracker } from "./member-timeout-expiry.js";
import { ModerationModule } from "./moderation-module.js";
import type { ModerationAppealHandler } from "./moderation-appeals.js";
import type { ModerationSystemPublicationRepository } from "./moderation-system-publication.js";
import { ModerationSystemPublicationWorker } from "./moderation-system-publication.js";
import type { ModerationPublicationRepository } from "./moderation-publication.js";
import { ModerationPublicationWorker } from "./moderation-publication.js";
import type { ModerationRepository } from "./moderation-repository.js";
import { TicketModule } from "./ticket-module.js";
import type { TicketPublicationRepository } from "./ticket-publication.js";
import { TicketPublicationWorker } from "./ticket-publication.js";
import type { TicketRepository } from "./ticket-repository.js";
import type { VoiceAccessRepository } from "./voice-access-repository.js";
import { VoiceRoomModule } from "./voice-room-module.js";
import type { VoicePublicationRepository } from "./voice-publication.js";
import { VoicePublicationWorker } from "./voice-publication.js";
import type { VoiceRoomRepository } from "./voice-room-repository.js";

export interface GuildCore {
  readonly audit: AuditBus;
  readonly moderationAppeals?: ModerationAppealHandler;
  stop(): Promise<void>;
}

export interface GuildCoreOptions {
  readonly appealInviteUrl?: string;
  readonly automodPublicationRepository?: AutomodPublicationRepository;
  readonly client: Client;
  readonly databaseConnected: boolean;
  readonly guildId: string;
  readonly guildResourceCatalogWriter?: GuildResourceCatalogWriter;
  readonly logger: Logger;
  readonly messageArchiveReader?: MessageArchiveReader;
  readonly moderationPublicationRepository?: ModerationPublicationRepository;
  readonly moderationRepository?: ModerationRepository;
  readonly moderationSystemPublicationRepository?: ModerationSystemPublicationRepository;
  readonly persistentWriters?: readonly AuditWriter[];
  readonly ticketPublicationRepository?: TicketPublicationRepository;
  readonly ticketRepository?: TicketRepository;
  readonly voiceAccessRepository?: VoiceAccessRepository;
  readonly voicePublicationRepository?: VoicePublicationRepository;
  readonly voiceRoomRepository?: VoiceRoomRepository;
}

function isMemberAutomodExempt(
  member: GuildMember | null,
  runtime: AutomodRuntime,
): boolean {
  return (
    !member ||
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.id === member.guild.ownerId ||
    member.roles.cache.some((role) =>
      runtime.config.exemptRoleIds.includes(role.id),
    )
  );
}

function isAutomodExempt(message: Message, runtime: AutomodRuntime): boolean {
  return (
    runtime.config.exemptChannelIds.includes(message.channelId) ||
    isMemberAutomodExempt(message.member, runtime)
  );
}

async function applyCustomSanction(
  message: Message,
  action: "ban" | "kick" | "observe" | "points" | "quarantine" | "timeout",
  deleteMessage: boolean,
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
  if (deleteMessage) {
    if (!message.deletable) {
      throw new Error("Matched message cannot be deleted by the bot");
    }
    await message.delete();
  }
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
    createdAt: message.editedTimestamp ?? message.createdTimestamp,
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

  await channel.send({
    allowedMentions: { users: [userId] },
    content: `<@${userId}>`,
    embeds: [buildWelcomeEmbed()],
  });
}

function isOwner(member: GuildMember, resources: GuildResources) {
  return member.roles.cache.has(resources.roles.owner);
}

function isTemporaryVoiceChannel(
  channel: {
    readonly id: string;
    readonly parentId?: string | null;
    readonly type: ChannelType;
  },
  resources: GuildResources,
): boolean {
  return (
    channel.type === ChannelType.GuildVoice &&
    channel.parentId === resources.channels.voice.category &&
    channel.id !== resources.channels.voice.createRoom
  );
}

export function isManagedTicketChannelShape(
  channel: {
    readonly id: string;
    readonly name: string;
    readonly parentId?: string | null;
    readonly topic?: string | null;
    readonly type: ChannelType;
  },
  supportCategoryId: string,
  ticketPanelChannelId: string,
): boolean {
  return (
    channel.type === ChannelType.GuildText &&
    channel.parentId === supportCategoryId &&
    channel.id !== ticketPanelChannelId &&
    /^тикет-\d{4,}$/.test(channel.name) &&
    /^Тикет #\d{4,} · /.test(channel.topic ?? "")
  );
}

export function shouldLogChannelEventInDiscord(input: {
  readonly managedTicket: boolean;
  readonly temporaryVoice: boolean;
}): boolean {
  return !(input.managedTicket || input.temporaryVoice);
}

async function fetchMemberTimeoutAuditContext(
  guild: Guild,
  userId: string,
  occurredAt: number,
): Promise<MemberTimeoutAuditContext | null> {
  for (const waitMs of [0, 350, 750]) {
    if (waitMs > 0) await delay(waitMs);
    const logs = await guild.fetchAuditLogs({
      limit: 8,
      type: AuditLogEvent.MemberUpdate,
    });
    const context = findMemberTimeoutAuditContext(
      [...logs.entries.values()],
      userId,
      occurredAt,
    );
    if (context) return context;
  }
  return null;
}

async function fetchMemberRoleAuditContext(
  guild: Guild,
  userId: string,
  addedRoles: readonly MemberRoleReference[],
  removedRoles: readonly MemberRoleReference[],
  occurredAt: number,
): Promise<MemberRoleAuditContext | null> {
  for (const waitMs of [0, 350, 750]) {
    if (waitMs > 0) await delay(waitMs);
    const logs = await guild.fetchAuditLogs({
      limit: 8,
      type: AuditLogEvent.MemberRoleUpdate,
    });
    const context = findMemberRoleAuditContext([...logs.entries.values()], {
      addedRoleIds: addedRoles.map(({ id }) => id),
      occurredAt,
      removedRoleIds: removedRoles.map(({ id }) => id),
      userId,
    });
    if (context) return context;
  }
  return null;
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
  const members = await guild.members.fetch();
  logger.info(
    { guildId, memberCount: members.size },
    "guild member cache hydrated",
  );
  const resources = await resolveGuildResources(guild);
  const refreshGuildResourceCatalog = async () => {
    await options.guildResourceCatalogWriter?.replace(
      guildId,
      collectGuildResourceCatalog(guild),
    );
  };
  await refreshGuildResourceCatalog();
  const removeGuildResource = async (
    kind: GuildResourceCatalogEntry["kind"],
    resourceId: string,
  ) => {
    try {
      await options.guildResourceCatalogWriter?.remove(
        guildId,
        kind,
        resourceId,
      );
    } catch (error) {
      logger.warn(
        { error, kind, resourceId },
        "guild resource catalog removal failed",
      );
    }
  };
  const upsertGuildResource = async (
    entry: GuildResourceCatalogEntry | null,
  ) => {
    if (!entry) return;
    try {
      await options.guildResourceCatalogWriter?.upsert(guildId, entry);
    } catch (error) {
      logger.warn(
        { error, kind: entry.kind, resourceId: entry.id },
        "guild resource catalog upsert failed",
      );
    }
  };
  const automodRuntime = new AutomodRuntime();
  const automodSignalLogGate = new AutomodSignalLogGate(15_000);
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
  const moderationModule = options.moderationRepository
    ? new ModerationModule({
        audit,
        ...(options.appealInviteUrl
          ? { appealInviteUrl: options.appealInviteUrl }
          : {}),
        guild,
        logger,
        quarantineRoleId: resources.roles.quarantine,
        repository: options.moderationRepository,
      })
    : undefined;
  const moderationPublicationWorker =
    moderationModule && options.moderationPublicationRepository
      ? new ModerationPublicationWorker({
          applier: moderationModule,
          logger,
          repository: options.moderationPublicationRepository,
        })
      : undefined;
  const moderationSystemPublicationWorker =
    moderationModule && options.moderationSystemPublicationRepository
      ? new ModerationSystemPublicationWorker({
          applier: {
            async apply(config) {
              await discordAutomod.apply(config.automod);
              await moderationModule.apply(config.manual);
            },
          },
          logger,
          repository: options.moderationSystemPublicationRepository,
        })
      : undefined;
  const ticketModule = options.ticketRepository
    ? new TicketModule({
        audit,
        guild,
        logger,
        ...(moderationModule ? { moderationAppeals: moderationModule } : {}),
        repository: options.ticketRepository,
        resources,
      })
    : undefined;
  const ticketPublicationWorker =
    ticketModule && options.ticketPublicationRepository
      ? new TicketPublicationWorker({
          applier: ticketModule,
          logger,
          repository: options.ticketPublicationRepository,
        })
      : undefined;
  const voiceModule =
    options.voiceAccessRepository && options.voiceRoomRepository
      ? new VoiceRoomModule({
          accessRepository: options.voiceAccessRepository,
          audit,
          guild,
          logger,
          repository: options.voiceRoomRepository,
          resources,
        })
      : undefined;
  const voicePublicationWorker =
    voiceModule && options.voicePublicationRepository
      ? new VoicePublicationWorker({
          applier: voiceModule,
          logger,
          repository: options.voicePublicationRepository,
        })
      : undefined;
  const startedAt = new Date();
  const timeoutExpiryTracker = new MemberTimeoutExpiryTracker({
    async onExpired({ timeoutUntil, userId }) {
      const description = describeNaturalMemberTimeoutExpiry(timeoutUntil);
      await audit.publish({
        category: "moderation",
        discord: true,
        eventType: "member.timeout_expired",
        payload: { timeoutUntil: new Date(timeoutUntil).toISOString() },
        subject: { id: userId, kind: "user" },
        summary: description.summary,
        title: description.title,
      });
      await moderationModule?.endSanction("timeout", userId);
    },
    onError(error, userId) {
      logger.error({ error, userId }, "member timeout expiry tracking failed");
    },
    async resolveTimeoutUntil(userId) {
      const member = await guild.members.fetch({ force: true, user: userId });
      return member.communicationDisabledUntilTimestamp;
    },
  });

  await registerStatusCommand(guild);
  await publicationWorker?.start();
  await moderationModule?.start();
  await moderationPublicationWorker?.start();
  await moderationSystemPublicationWorker?.start();
  await ticketModule?.start();
  await ticketPublicationWorker?.start();
  await voiceModule?.start();
  await voicePublicationWorker?.start();

  for (const member of members.values()) {
    const timeoutUntil = member.communicationDisabledUntilTimestamp;
    if (timeoutUntil && timeoutUntil > Date.now()) {
      timeoutExpiryTracker.track(member.id, timeoutUntil);
    }
  }

  safeOn(Events.GuildMemberAdd, async (member) => {
    if (member.guild.id !== guildId) return;
    await upsertGuildResource(memberCatalogEntry(member));
    if (member.user.bot) return;
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
    if (member.guild.id !== guildId) return;
    timeoutExpiryTracker.cancel(member.id);
    await removeGuildResource("member", member.id);
    if (member.user.bot) return;
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
    const occurredAt = Date.now();
    await upsertGuildResource(memberCatalogEntry(after));
    const addedRoles = after.roles.cache
      .filter((role) => !before.roles.cache.has(role.id))
      .map(({ id, name }) => ({ id, name }));
    const removedRoles = before.roles.cache
      .filter((role) => !after.roles.cache.has(role.id))
      .map(({ id, name }) => ({ id, name }));
    const nicknameChanged = before.nickname !== after.nickname;
    const timeoutChanged =
      before.communicationDisabledUntilTimestamp !==
      after.communicationDisabledUntilTimestamp;
    const timeoutBefore = before.communicationDisabledUntilTimestamp;
    const timeoutAfter = after.communicationDisabledUntilTimestamp;
    const timeoutActiveAfter =
      timeoutAfter !== null && timeoutAfter > occurredAt;
    const naturallyExpired =
      timeoutChanged &&
      timeoutBefore !== null &&
      timeoutBefore <= occurredAt &&
      !timeoutActiveAfter;
    const timeoutAlreadyLogged =
      timeoutChanged &&
      !timeoutActiveAfter &&
      timeoutExpiryTracker.consumeRecentExpiry(after.id);
    if (timeoutChanged) {
      timeoutExpiryTracker.cancel(after.id);
      if (timeoutActiveAfter && timeoutAfter !== null) {
        timeoutExpiryTracker.track(after.id, timeoutAfter);
      } else {
        await moderationModule?.endSanction("timeout", after.id);
      }
    }
    if (removedRoles.some(({ id }) => id === resources.roles.quarantine)) {
      await moderationModule?.endSanction("quarantine", after.id);
    }
    if (
      addedRoles.length === 0 &&
      removedRoles.length === 0 &&
      !nicknameChanged &&
      !timeoutChanged
    ) {
      return;
    }
    let roleAuditContext: MemberRoleAuditContext | null = null;
    if (addedRoles.length > 0 || removedRoles.length > 0) {
      try {
        roleAuditContext = await fetchMemberRoleAuditContext(
          after.guild,
          after.id,
          addedRoles,
          removedRoles,
          occurredAt,
        );
      } catch (error) {
        logger.warn(
          { error, userId: after.id },
          "member role audit context unavailable",
        );
      }
    }
    let timeoutAuditContext: MemberTimeoutAuditContext | null = null;
    if (timeoutChanged && !naturallyExpired && !timeoutAlreadyLogged) {
      try {
        timeoutAuditContext = await fetchMemberTimeoutAuditContext(
          after.guild,
          after.id,
          occurredAt,
        );
      } catch (error) {
        logger.warn(
          { error, userId: after.id },
          "member timeout audit context unavailable",
        );
      }
    }
    const timeoutChange =
      timeoutChanged && !timeoutAlreadyLogged
        ? naturallyExpired && timeoutBefore !== null
          ? describeNaturalMemberTimeoutExpiry(timeoutBefore)
          : describeMemberTimeoutChange(
              timeoutBefore,
              timeoutAfter,
              occurredAt,
              timeoutAuditContext,
            )
        : null;
    const roleChange = describeMemberRoleChange({
      addedRoles,
      auditContext: roleAuditContext,
      removedRoles,
    });

    if (!roleChange && !nicknameChanged && !timeoutChange) return;

    const actorId = timeoutAuditContext?.actorId ?? roleChange?.actorId;

    await audit.publish({
      ...(actorId ? { actor: { id: actorId, kind: "user" as const } } : {}),
      category: timeoutChange ? "moderation" : "server",
      discord: true,
      eventType: timeoutChange
        ? naturallyExpired
          ? "member.timeout_expired"
          : "member.timeout_changed"
        : "member.updated",
      payload: {
        addedRoleIds: addedRoles.map(({ id }) => id),
        addedRoles: addedRoles.map(({ name }) => name),
        nicknameAfter: after.nickname,
        nicknameBefore: before.nickname,
        removedRoleIds: removedRoles.map(({ id }) => id),
        removedRoles: removedRoles.map(({ name }) => name),
        roleAuditActorId: roleAuditContext?.actorId,
        roleAuditReason: roleAuditContext?.reason,
        timeoutAfter: after.communicationDisabledUntil?.toISOString(),
        timeoutAuditActorId: timeoutAuditContext?.actorId,
        timeoutAuditReason: timeoutAuditContext?.reason,
        timeoutBefore: before.communicationDisabledUntil?.toISOString(),
      },
      subject: { id: after.id, kind: "user" },
      summary: [
        roleChange?.summary ?? "",
        nicknameChanged ? "Изменён никнейм." : "",
        timeoutChange?.summary ?? "",
      ]
        .filter(Boolean)
        .join("\n"),
      title: timeoutChange?.title ?? roleChange?.title ?? "Изменён участник",
    });
  });

  const inspectAutomodMessage = async (
    message: Message,
    sourceEventKey: string,
  ): Promise<void> => {
    if (await ticketModule?.handleMessage(message)) return;
    if (message.author.bot || isAutomodExempt(message, automodRuntime)) return;
    const decision = automodRuntime.inspect(toModerationMessage(message));
    if (decision.findings.length === 0) return;
    let sanctionSuppressed = false;
    const publishSignal = () => {
      const signals = decision.findings.map(({ signal }) => signal);
      if (
        !automodSignalLogGate.shouldPublish({
          action: decision.action,
          channelId: message.channelId,
          signals,
          userId: message.author.id,
        })
      ) {
        return Promise.resolve();
      }
      return audit.publish({
        actor: { id: message.author.id, kind: "user" },
        category: "security",
        discord: true,
        eventType: "moderation.signals_observed",
        payload: {
          channelId: message.channelId,
          action: decision.action,
          findings: decision.findings,
          messageId: message.id,
          sanctionSuppressed,
        },
        severity: "warning",
        subject: {
          channelId: message.channelId,
          id: message.id,
          kind: "message",
        },
        summary: [
          buildAutomodLogSummary(
            automodRuntime.config,
            decision,
            message.channelId,
          ),
          sanctionSuppressed
            ? "Повторное наказание не применено: действует защита от дублей."
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
        title: "Сработала автомодерация",
      });
    };
    if (
      decision.action === "observe" &&
      decision.points === 0 &&
      !decision.deleteMessage
    ) {
      await publishSignal();
      return;
    }
    try {
      if (moderationModule) {
        const result = await moderationModule.applyAutomodViolation({
          action:
            automodRuntime.config.mode === "points"
              ? "points"
              : decision.action === "observe" && decision.points > 0
                ? "points"
                : decision.action,
          applyThresholds: automodRuntime.config.mode === "enforce",
          channelId: message.channelId,
          deleteMessage: decision.deleteMessage,
          message,
          messageId: message.id,
          points: decision.points,
          signals: decision.findings.map(({ signal }) => signal),
          sourceEventKey,
          summary: decision.findings
            .map(({ signal }) => automodSignalLabel(signal))
            .join(", "),
          timeoutMinutes: decision.timeoutMinutes,
          userId: message.author.id,
        });
        sanctionSuppressed = result.sanctionSuppressed;
      } else if (
        decision.deleteMessage ||
        (decision.action !== "observe" && decision.action !== "points")
      ) {
        await applyCustomSanction(
          message,
          decision.action,
          decision.deleteMessage,
          decision.timeoutMinutes,
          resources.roles.quarantine,
        );
      } else {
        throw new Error("Хранилище дел модерации недоступно");
      }
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
    await publishSignal();
  };

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
    await inspectAutomodMessage(message, `message:${message.id}:created`);
  });

  safeOn(Events.MessageUpdate, async (before, after) => {
    if (after.guildId !== guildId) return;
    const archivedBefore = await options.messageArchiveReader?.findLatest(
      guildId,
      after.id,
    );
    const current = after.partial ? await after.fetch() : after;
    const beforeContent = before.content ?? archivedBefore?.content ?? null;
    if (
      beforeContent === current.content &&
      before.attachments.size === current.attachments.size
    ) {
      return;
    }
    await audit.publish({
      actor: { id: current.author.id, kind: "user" },
      category: "messages",
      discord: true,
      eventType: "message.updated",
      payload: {
        after: messagePayload(current),
        before: {
          ...messagePayload(before),
          content: beforeContent,
        },
      },
      subject: {
        channelId: current.channelId,
        id: current.id,
        kind: "message",
      },
      summary: [
        `Сообщение изменено в <#${current.channelId}>.`,
        `До: ${messageExcerpt(beforeContent)}`,
        `После: ${messageExcerpt(current.content)}`,
      ].join("\n"),
      title: "Сообщение изменено",
    });
    await inspectAutomodMessage(
      current,
      `message:${current.id}:edited:${current.editedTimestamp ?? current.createdTimestamp}`,
    );
  });

  safeOn(Events.MessageDelete, async (message) => {
    if (message.guildId !== guildId) return;
    await voiceModule?.handleMessageDelete(message.channelId, message.id);
    const livePayload = messagePayload(message);
    const archived = await options.messageArchiveReader?.findLatest(
      guildId,
      message.id,
    );
    const log = buildDeletedMessageLog(
      {
        attachments: livePayload.attachments,
        ...(message.author?.id ? { authorId: message.author.id } : {}),
        channelId: message.channelId,
        content: message.content,
        messageId: message.id,
      },
      archived ?? null,
    );
    await audit.publish({
      ...(log.actorId
        ? { actor: { id: log.actorId, kind: "user" } as const }
        : {}),
      category: "messages",
      discord: true,
      eventType: "message.deleted",
      payload: log.payload,
      subject: log.subject,
      summary: log.summary,
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
    await moderationModule?.endSanction("ban", ban.user.id);
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
    const inviteMode = automodRuntime.config.mode;
    const primaryExecutionType =
      inviteMode === "enforce" &&
      automodRuntime.config.inviteLinks.deleteMessage
        ? AutoModerationActionType.BlockMessage
        : AutoModerationActionType.SendAlertMessage;
    if (
      managedInviteRule &&
      automodRuntime.config.enabled &&
      execution.action.type === primaryExecutionType &&
      moderationModule &&
      inviteMode !== "observe" &&
      (inviteAction === "points" ||
        (inviteMode === "enforce" &&
          (inviteAction !== "observe" ||
            automodRuntime.config.inviteLinks.deleteMessage)))
    ) {
      const member = await guild.members.fetch(execution.userId);
      if (isMemberAutomodExempt(member, automodRuntime)) return;
      await moderationModule.applyAutomodViolation({
        action: inviteMode === "points" ? "points" : inviteAction,
        applyThresholds: inviteMode === "enforce",
        channelId: execution.channelId ?? resources.channels.logs.security,
        deleteMessage:
          inviteMode === "enforce" &&
          automodRuntime.config.inviteLinks.deleteMessage,
        messageId: execution.messageId ?? null,
        points:
          inviteAction === "points"
            ? automodRuntime.config.inviteLinks.points
            : 0,
        signals: ["invite-links"],
        sourceEventKey: buildDiscordAutomodSourceEventKey(execution),
        summary: "стороннее приглашение Discord",
        timeoutMinutes: automodRuntime.config.inviteLinks.timeoutMinutes,
        userId: execution.userId,
      });
    }
    await audit.publish({
      actor: { id: execution.userId, kind: "user" },
      category: managedInviteRule ? "security" : "moderation",
      discord:
        !managedInviteRule || execution.action.type === primaryExecutionType,
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
        managedInviteRule
          ? `Удаление сообщения: ${automodRuntime.config.inviteLinks.deleteMessage ? "включено" : "выключено"}.`
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
    await voiceModule?.handleVoiceState(before, after);
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
      const managedTicket = isManagedTicketChannelShape(
        channel,
        resources.channels.support.category,
        resources.channels.support.openTicket,
      );
      const temporaryVoice = isTemporaryVoiceChannel(channel, resources);
      await upsertGuildResource(channelCatalogEntry(channel));
      await audit.publish({
        category: "server",
        discord: shouldLogChannelEventInDiscord({
          managedTicket,
          temporaryVoice,
        }),
        eventType: "channel.created",
        payload: {
          channelId: channel.id,
          createdAt: channel.createdAt.toISOString(),
          name: channel.name,
          parentId: channel.parentId,
          type: channel.type,
        },
        subject: { id: channel.id, kind: "channel", label: channel.name },
        summary: `Создан канал ${channel.name}.`,
        title: "Канал создан",
      });
    }
  });

  safeOn(Events.ChannelDelete, async (channel) => {
    if (!channel.isDMBased() && channel.guild.id === guildId) {
      const managedTicket = isManagedTicketChannelShape(
        channel,
        resources.channels.support.category,
        resources.channels.support.openTicket,
      );
      const temporaryCandidate = isTemporaryVoiceChannel(channel, resources);
      const managedVoiceRoom =
        channel.type === ChannelType.GuildVoice
          ? await voiceModule?.handleChannelDelete(channel)
          : false;
      await removeGuildResource("channel", channel.id);
      await audit.publish({
        category: "server",
        discord: shouldLogChannelEventInDiscord({
          managedTicket,
          temporaryVoice: temporaryCandidate || Boolean(managedVoiceRoom),
        }),
        eventType: "channel.deleted",
        payload: {
          channelId: channel.id,
          createdAt: channel.createdAt.toISOString(),
          deletedAt: new Date().toISOString(),
          name: channel.name,
          parentId: channel.parentId,
          type: channel.type,
        },
        subject: { id: channel.id, kind: "channel", label: channel.name },
        summary: `Удалён канал ${channel.name}. ID: ${channel.id}.`,
        title: "Канал удалён",
      });
    }
  });

  safeOn(Events.ChannelUpdate, async (before, after) => {
    if (before.isDMBased() || after.isDMBased() || after.guild.id !== guildId)
      return;
    const snapshot = (channel: typeof after): ChannelUpdateSnapshot => ({
      id: channel.id,
      name: channel.name,
      ...("nsfw" in channel ? { nsfw: channel.nsfw } : {}),
      parentId: channel.parentId,
      permissionOverwrites: channel.permissionOverwrites.cache.map(
        (overwrite) => ({
          allow: overwrite.allow.bitfield.toString(),
          deny: overwrite.deny.bitfield.toString(),
          id: overwrite.id,
          type: overwrite.type,
        }),
      ),
      position: channel.position,
      ...("rateLimitPerUser" in channel
        ? { rateLimitPerUser: channel.rateLimitPerUser }
        : {}),
      ...("topic" in channel ? { topic: channel.topic } : {}),
      type: channel.type,
    });
    const beforeSnapshot = snapshot(before);
    const afterSnapshot = snapshot(after);
    const description = describeChannelUpdate(beforeSnapshot, afterSnapshot);
    const managedTicket = isManagedTicketChannelShape(
      after,
      resources.channels.support.category,
      resources.channels.support.openTicket,
    );
    const temporaryVoice = isTemporaryVoiceChannel(after, resources);
    await upsertGuildResource(channelCatalogEntry(after));
    await audit.publish({
      category: "server",
      discord: shouldLogChannelEventInDiscord({
        managedTicket,
        temporaryVoice,
      }),
      eventType: "channel.updated",
      payload: {
        after: afterSnapshot,
        before: beforeSnapshot,
        changes: description.changes,
      },
      subject: { id: after.id, kind: "channel", label: after.name },
      summary: description.summary,
      title: description.title,
    });
  });

  safeOn(Events.GuildRoleCreate, async (role) => {
    if (role.guild.id !== guildId) return;
    await upsertGuildResource(roleCatalogEntry(role));
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
    await removeGuildResource("role", role.id);
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
    await upsertGuildResource(roleCatalogEntry(after));
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
    if (await moderationModule?.handleInteraction(interaction)) return;
    if (await ticketModule?.handleInteraction(interaction)) return;
    if (await voiceModule?.handleInteraction(interaction)) return;
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
    ...(moderationModule ? { moderationAppeals: moderationModule } : {}),
    async stop() {
      timeoutExpiryTracker.stop();
      await voicePublicationWorker?.stop();
      await ticketPublicationWorker?.stop();
      await moderationPublicationWorker?.stop();
      await moderationSystemPublicationWorker?.stop();
      await voiceModule?.stop();
      await ticketModule?.stop();
      await moderationModule?.stop();
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
