import {
  ChannelType,
  ContainerBuilder,
  Events,
  MessageFlags,
  PermissionFlagsBits,
  TextDisplayBuilder,
  escapeMarkdown,
  type Client,
  type Guild,
  type Interaction,
  type Message,
  type OverwriteResolvable,
  type Role,
  type TextChannel,
} from "discord.js";
import type { Logger } from "pino";

import { AsyncEventGate } from "./async-event-gate.js";
import { AuditBus, type AuditWriter } from "./audit.js";
import { DiscordAuditWriter } from "./discord-messages.js";
import type { GuildResources } from "./guild-resources.js";
import type { ModerationAppealHandler } from "./moderation-appeals.js";
import { TicketModule } from "./ticket-module.js";
import type { TicketRepository } from "./ticket-repository.js";

interface AppealGuildSetup {
  readonly guild: Guild;
  readonly inviteUrl: string;
  readonly resources: GuildResources;
  readonly staffRoleIds: readonly string[];
}

export interface AppealGuildCore {
  stop(): Promise<void>;
}

const roleDefinitions = [
  {
    color: 0xf2f2ef,
    name: "Владелец",
    permissions: [PermissionFlagsBits.Administrator],
  },
  {
    color: 0xc7c7c2,
    name: "Куратор",
    permissions: [
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.ViewAuditLog,
    ],
  },
  {
    color: 0x9b9b97,
    name: "Модератор",
    permissions: [PermissionFlagsBits.ManageMessages],
  },
  {
    color: 0x737370,
    name: "Испытательный срок",
    permissions: [PermissionFlagsBits.ManageMessages],
  },
] as const;

async function ensureRole(
  guild: Guild,
  definition: (typeof roleDefinitions)[number],
): Promise<Role> {
  const existing = guild.roles.cache.find(
    (role) => role.name === definition.name,
  );
  if (existing) return existing;
  return guild.roles.create({
    colors: { primaryColor: definition.color },
    hoist: true,
    name: definition.name,
    permissions: definition.permissions,
    reason: "fxvrlxss_ appeal server setup",
  });
}

async function ensureCategory(
  guild: Guild,
  name: string,
  permissionOverwrites: readonly OverwriteResolvable[],
) {
  const existing = guild.channels.cache.find(
    (channel) =>
      channel.type === ChannelType.GuildCategory && channel.name === name,
  );
  if (existing) return existing;
  return guild.channels.create({
    name,
    permissionOverwrites: [...permissionOverwrites],
    reason: "fxvrlxss_ appeal server setup",
    type: ChannelType.GuildCategory,
  });
}

async function ensureTextChannel(
  guild: Guild,
  name: string,
  permissionOverwrites: readonly OverwriteResolvable[],
  parentId?: string,
): Promise<TextChannel> {
  const existing = guild.channels.cache.find(
    (channel) =>
      channel.type === ChannelType.GuildText &&
      channel.name === name &&
      channel.parentId === (parentId ?? null),
  );
  if (existing?.type === ChannelType.GuildText) return existing;
  return guild.channels.create({
    name,
    ...(parentId ? { parent: parentId } : {}),
    permissionOverwrites: [...permissionOverwrites],
    reason: "fxvrlxss_ appeal server setup",
    type: ChannelType.GuildText,
  });
}

async function ensurePinnedCard(
  channel: TextChannel,
  marker: string,
  content: string,
): Promise<void> {
  const pins = await channel.messages.fetchPins({ limit: 50 });
  const existing = pins.items
    .map(({ message }) => message)
    .find(
      (message) =>
        message.author.id === channel.client.user.id &&
        JSON.stringify(
          message.components.map((item) => item.toJSON()),
        ).includes(marker),
    );
  const components = [
    new ContainerBuilder()
      .setAccentColor(0xf2f2ef)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content)),
  ];
  if (existing) {
    await existing.edit({
      allowedMentions: { parse: [] },
      components,
      flags: MessageFlags.IsComponentsV2,
    });
    return;
  }
  const message = await channel.send({
    allowedMentions: { parse: [] },
    components,
    flags: MessageFlags.IsComponentsV2,
  });
  await message.pin("fxvrlxss_ appeal server information");
}

function staffOverwrites(
  guild: Guild,
  staffRoleIds: readonly string[],
): OverwriteResolvable[] {
  return [
    {
      deny: [PermissionFlagsBits.ViewChannel],
      id: guild.roles.everyone.id,
    },
    ...staffRoleIds.map((id) => ({
      allow: [
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ViewChannel,
      ],
      id,
    })),
  ];
}

export async function prepareAppealGuild(
  client: Client,
  guildId: string,
): Promise<AppealGuildSetup> {
  const guild = await client.guilds.fetch(guildId);
  await Promise.all([guild.channels.fetch(), guild.roles.fetch()]);
  const staffRoles: Role[] = [];
  for (const definition of roleDefinitions) {
    staffRoles.push(await ensureRole(guild, definition));
  }
  await Promise.all([guild.channels.fetch(), guild.roles.fetch()]);
  const staffRoleIds = staffRoles.map(({ id }) => id);
  const publicReadOnly: OverwriteResolvable[] = [
    {
      allow: [
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ViewChannel,
      ],
      deny: [PermissionFlagsBits.SendMessages],
      id: guild.roles.everyone.id,
    },
  ];
  const hidden: OverwriteResolvable[] = [
    {
      deny: [PermissionFlagsBits.ViewChannel],
      id: guild.roles.everyone.id,
    },
  ];
  const entry = await ensureTextChannel(guild, "прихожая", publicReadOnly);
  const rules = await ensureTextChannel(guild, "правила", publicReadOnly);
  const appealCategory = await ensureCategory(guild, "АПЕЛЛЯЦИИ", hidden);
  const openTicket = await ensureTextChannel(
    guild,
    "открыть-апелляцию",
    publicReadOnly,
    appealCategory.id,
  );
  const teamCategory = await ensureCategory(
    guild,
    "КОМАНДА",
    staffOverwrites(guild, staffRoleIds),
  );
  const discussions = await ensureTextChannel(
    guild,
    "обсуждение-апелляций",
    staffOverwrites(guild, staffRoleIds),
    teamCategory.id,
  );
  const logsCategory = await ensureCategory(
    guild,
    "ЛОГИ",
    staffOverwrites(guild, staffRoleIds),
  );
  const logs = await ensureTextChannel(
    guild,
    "апелляции",
    staffOverwrites(guild, staffRoleIds),
    logsCategory.id,
  );

  await ensurePinnedCard(
    entry,
    "Сервер апелляций",
    [
      "## Сервер апелляций",
      `Этот сервер принимает обжалования наказаний с сервера **${escapeMarkdown("fxvrlxss_")}**.`,
      "Перед обращением подготовьте номер дела из уведомления бота.",
      `Открыть обращение: <#${openTicket.id}>`,
    ].join("\n"),
  );
  await ensurePinnedCard(
    rules,
    "Правила апелляций",
    [
      "## Правила апелляций",
      "1. Одно активное дело можно обжаловать один раз.",
      "2. Укажите номер дела и спокойно изложите основания для пересмотра.",
      "3. Не создавайте повторные обращения и не давите на сотрудников.",
      "4. Решение по закрытой апелляции окончательное.",
    ].join("\n"),
  );

  const invites = await guild.invites.fetch();
  const existingInvite = invites.find(
    (invite) =>
      invite.channelId === entry.id &&
      invite.inviter?.id === client.user?.id &&
      invite.maxAge === 0 &&
      invite.maxUses === 0,
  );
  const invite =
    existingInvite ??
    (await entry.createInvite({
      maxAge: 0,
      maxUses: 0,
      reason: "Permanent fxvrlxss_ appeal server invite",
      unique: true,
    }));
  const resources: GuildResources = {
    channels: {
      entry: entry.id,
      logs: {
        bot: logs.id,
        messages: logs.id,
        moderation: logs.id,
        security: logs.id,
        server: logs.id,
      },
      support: {
        category: appealCategory.id,
        openTicket: openTicket.id,
      },
      team: { ticketDiscussions: discussions.id },
      voice: {
        category: appealCategory.id,
        createRoom: openTicket.id,
      },
    },
    roles: {
      member: guild.roles.everyone.id,
      owner:
        staffRoles.find(({ name }) => name === "Владелец")?.id ??
        guild.roles.everyone.id,
      quarantine: guild.roles.everyone.id,
    },
  };
  return { guild, inviteUrl: invite.url, resources, staffRoleIds };
}

export function appealTicketConfig(staffRoleIds: readonly string[]) {
  return {
    allowReopen: false,
    autoCloseHours: 0,
    enabled: true,
    maxOpenTicketsPerUser: 1,
    panelDescription:
      "Укажите номер дела из уведомления fxvrlxss_. Бот проверит, что дело активно и принадлежит вам.",
    panelTitle: "Обжалование наказания",
    staffRoleIds: [...staffRoleIds],
    transcriptEnabled: true,
    types: [
      {
        description: "Недоступно на сервере апелляций.",
        enabled: false,
        key: "help" as const,
        label: "Помощь",
      },
      {
        description: "Недоступно на сервере апелляций.",
        enabled: false,
        key: "member-report" as const,
        label: "Жалоба на участника",
      },
      {
        description: "Запросить пересмотр активного дела модерации.",
        enabled: true,
        key: "punishment-appeal" as const,
        label: "Обжаловать наказание",
      },
      {
        description: "Недоступно на сервере апелляций.",
        enabled: false,
        key: "partnership" as const,
        label: "Сотрудничество",
      },
    ],
  };
}

export async function startAppealGuildCore(options: {
  readonly client: Client;
  readonly logger: Logger;
  readonly moderationAppeals: ModerationAppealHandler;
  readonly persistentWriters?: readonly AuditWriter[];
  readonly repository: TicketRepository;
  readonly setup: AppealGuildSetup;
}): Promise<AppealGuildCore> {
  const { client, logger, setup } = options;
  const eventGate = new AsyncEventGate((error) => {
    logger.error({ error }, "appeal guild event gate failed");
  });
  const audit = new AuditBus(
    setup.guild.id,
    [
      ...(options.persistentWriters ?? []),
      new DiscordAuditWriter(client, setup.resources),
    ],
    logger,
  );
  const tickets = new TicketModule({
    audit,
    guild: setup.guild,
    initialConfig: appealTicketConfig(setup.staffRoleIds),
    logger,
    moderationAppeals: options.moderationAppeals,
    repository: options.repository,
    resources: setup.resources,
  });
  await tickets.start();

  const onInteraction = (interaction: Interaction) => {
    if (interaction.guildId !== setup.guild.id) return;
    eventGate.run(async () => {
      await tickets.handleInteraction(interaction);
    });
  };
  const onMessage = (message: Message) => {
    if (message.guildId !== setup.guild.id) return;
    eventGate.run(async () => {
      await tickets.handleMessage(message);
    });
  };
  client.on(Events.InteractionCreate, onInteraction);
  client.on(Events.MessageCreate, onMessage);
  await audit.publish({
    category: "bot",
    discord: true,
    eventType: "appeal_server.ready",
    summary: "Панель апелляций и межсерверная проверка дел запущены.",
    title: "Сервер апелляций подключён",
  });

  return {
    async stop() {
      client.off(Events.InteractionCreate, onInteraction);
      client.off(Events.MessageCreate, onMessage);
      await eventGate.close();
      await tickets.stop();
      await audit.publish({
        category: "bot",
        discord: true,
        eventType: "appeal_server.stopping",
        summary: "Контур апелляций штатно останавливается.",
        title: "Сервер апелляций останавливается",
      });
      await audit.drain();
    },
  };
}
