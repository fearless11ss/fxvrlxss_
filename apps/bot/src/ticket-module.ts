import {
  defaultTicketConfig,
  ticketConfigSchema,
  type TicketConfig,
  type TicketTypeKey,
} from "@fxvrlxss/domain/ticket-config";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  FileBuilder,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  escapeMarkdown,
  type Guild,
  type GuildMember,
  type Interaction,
  type Message,
  type TextChannel,
} from "discord.js";
import type { Logger } from "pino";

import type { AuditBus } from "./audit.js";
import type { GuildResources } from "./guild-resources.js";
import type {
  ModerationAppealHandler,
  ModerationAppealOutcome,
} from "./moderation-appeals.js";
import type { TicketConfigurationApplier } from "./ticket-publication.js";
import type {
  TicketRecord,
  TicketRepository,
  TicketTranscriptEntry,
} from "./ticket-repository.js";
import {
  buildTicketTranscriptFiles,
  countReadableTicketTranscriptEntries,
} from "./ticket-transcript.js";

const PANEL_SELECT_ID = "ticket:type";
const OPEN_MODAL_PREFIX = "ticket:create:";
const CLOSE_MODAL_ID = "ticket:close:submit";
const DELETE_MODAL_ID = "ticket:delete:submit";
const ACTIVE_STATES = new Set(["claimed", "open", "reopened"]);

function ticketNumber(value: number): string {
  return String(value).padStart(4, "0");
}

export function describeTicketChannelDeletion(input: {
  readonly channelId: string;
  readonly channelName: string;
  readonly ticketNumber: number;
}): string {
  return [
    `Удалён канал закрытого тикета #${ticketNumber(input.ticketNumber)}.`,
    `Название: ${escapeMarkdown(input.channelName)}`,
    `Ссылка: <#${input.channelId}> · ID: ${input.channelId}`,
    "Запись и транскрипт сохранены в PostgreSQL.",
  ].join("\n");
}

function isUnknownDiscordChannel(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 10_003
  );
}

function ticketType(config: TicketConfig, key: string) {
  return config.types.find((type) => type.key === key);
}

export function buildTicketPanel(config: TicketConfig): ContainerBuilder[] {
  const enabledTypes = config.types.filter((type) => type.enabled);
  const options =
    enabledTypes.length > 0
      ? enabledTypes.map((type) => ({
          description: type.description,
          label: type.label,
          value: type.key,
        }))
      : [
          {
            description: "Включите хотя бы один тип обращения в панели.",
            label: "Нет доступных обращений",
            value: "unavailable",
          },
        ];
  const select = new StringSelectMenuBuilder()
    .setCustomId(PANEL_SELECT_ID)
    .setDisabled(!config.enabled || enabledTypes.length === 0)
    .setMaxValues(1)
    .setMinValues(1)
    .setPlaceholder(
      config.enabled ? "Выберите тему обращения" : "Тикеты временно отключены",
    )
    .addOptions(options);
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    select,
  );
  return [
    new ContainerBuilder()
      .setAccentColor(0xf2f2ef)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## ${escapeMarkdown(config.panelTitle)}\n${escapeMarkdown(config.panelDescription)}`,
        ),
      )
      .addActionRowComponents(row),
  ];
}

export function buildTicketControls(
  ticket: TicketRecord,
  config: TicketConfig,
): ContainerBuilder[] {
  const type = ticketType(config, ticket.type);
  const closed = ticket.status === "closed";
  const row = new ActionRowBuilder<ButtonBuilder>();
  if (closed) {
    if (
      config.allowReopen &&
      !ticket.channelDeletedAt &&
      !ticket.moderationCaseNumber
    ) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId("ticket:reopen")
          .setLabel("Открыть повторно")
          .setStyle(ButtonStyle.Secondary),
      );
    }
    if (!ticket.channelDeletedAt) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId("ticket:delete")
          .setLabel("Удалить канал")
          .setStyle(ButtonStyle.Danger),
      );
    }
  } else {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId("ticket:claim")
        .setDisabled(ticket.status === "claimed")
        .setLabel(ticket.status === "claimed" ? "Назначен" : "Взять")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("ticket:participant:add:open")
        .setLabel("Добавить")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("ticket:participant:remove:open")
        .setLabel("Удалить")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("ticket:close")
        .setLabel("Закрыть")
        .setStyle(ButtonStyle.Danger),
    );
  }

  const status =
    ticket.status === "claimed"
      ? `Назначен: <@${ticket.assignedToId}>`
      : ticket.status === "closed"
        ? "Закрыт"
        : ticket.status === "reopened"
          ? "Открыт повторно"
          : "Ожидает сотрудника";
  const container = new ContainerBuilder()
    .setAccentColor(closed ? 0x737370 : 0xf2f2ef)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `## Тикет #${ticketNumber(ticket.number)} · ${escapeMarkdown(type?.label ?? ticket.type)}`,
          `Автор: <@${ticket.authorId}>`,
          ticket.moderationCaseNumber
            ? `Дело модерации: **#${ticketNumber(ticket.moderationCaseNumber)}**`
            : undefined,
          `Статус: ${status}`,
          `**${escapeMarkdown(ticket.subject)}**`,
          escapeMarkdown(ticket.description),
        ]
          .filter((line): line is string => Boolean(line))
          .join("\n"),
      ),
    );
  if (row.components.length > 0) container.addActionRowComponents(row);
  return [container];
}

function openTicketModal(type: TicketTypeKey, label: string): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`${OPEN_MODAL_PREFIX}${type}`)
    .setTitle(label)
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Тема")
        .setDescription("Коротко опишите, с чем вы обращаетесь.")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("subject")
            .setMaxLength(100)
            .setMinLength(3)
            .setRequired(true)
            .setStyle(TextInputStyle.Short),
        ),
      new LabelBuilder()
        .setLabel("Описание")
        .setDescription("Добавьте детали, ссылки и важный контекст.")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("description")
            .setMaxLength(1_500)
            .setMinLength(10)
            .setRequired(true)
            .setStyle(TextInputStyle.Paragraph),
        ),
    );
  if (type === "punishment-appeal") {
    modal.addLabelComponents(
      new LabelBuilder()
        .setLabel("Номер дела")
        .setDescription("Укажите номер без знака #, например 42.")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("caseNumber")
            .setMaxLength(10)
            .setMinLength(1)
            .setRequired(true)
            .setStyle(TextInputStyle.Short),
        ),
    );
  }
  return modal;
}

function closeTicketModal(ticket: TicketRecord, staff: boolean): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(CLOSE_MODAL_ID)
    .setTitle("Закрыть тикет")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Причина закрытия")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("reason")
            .setMaxLength(300)
            .setMinLength(3)
            .setRequired(true)
            .setStyle(TextInputStyle.Paragraph),
        ),
    );
  if (ticket.moderationCaseNumber && staff) {
    modal.addLabelComponents(
      new LabelBuilder()
        .setLabel("Решение по обжалованию")
        .setDescription("Введите: удовлетворено или отклонено.")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("appealOutcome")
            .setMaxLength(15)
            .setMinLength(9)
            .setRequired(true)
            .setStyle(TextInputStyle.Short),
        ),
    );
  }
  return modal;
}

function deleteTicketChannelModal(ticket: TicketRecord): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(DELETE_MODAL_ID)
    .setTitle("Удалить канал тикета")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel(`Введите номер тикета: ${ticketNumber(ticket.number)}`)
        .setDescription(
          "Канал исчезнет безвозвратно. Запись и транскрипт останутся в базе.",
        )
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("ticketNumber")
            .setMaxLength(12)
            .setMinLength(4)
            .setPlaceholder(ticketNumber(ticket.number))
            .setRequired(true)
            .setStyle(TextInputStyle.Short),
        ),
    );
}

async function transcript(
  channel: TextChannel,
): Promise<readonly TicketTranscriptEntry[]> {
  const entries: TicketTranscriptEntry[] = [];
  let before: string | undefined;
  while (true) {
    const batch = await channel.messages.fetch({
      ...(before ? { before } : {}),
      limit: 100,
    });
    for (const message of batch.values()) {
      entries.push({
        attachments: message.attachments.map((attachment) => ({
          name: attachment.name,
          size: attachment.size,
          url: attachment.url,
        })),
        authorBot: message.author.bot,
        authorId: message.author.id,
        authorName:
          message.member?.displayName ??
          message.author.globalName ??
          message.author.username,
        components: message.components.map((component) => component.toJSON()),
        content: message.content,
        createdAt: message.createdAt.toISOString(),
        editedAt: message.editedAt?.toISOString() ?? null,
        embeds: message.embeds.map((embed) => embed.toJSON()),
        messageId: message.id,
        referencedMessageId: message.reference?.messageId ?? null,
        stickers: message.stickers.map((sticker) => ({
          id: sticker.id,
          name: sticker.name,
          url: sticker.url,
        })),
      });
    }
    if (batch.size < 100) break;
    before = batch.last()?.id;
    if (!before) break;
  }
  return entries.sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );
}

export class TicketModule implements TicketConfigurationApplier {
  readonly #audit: AuditBus;
  readonly #guild: Guild;
  readonly #logger: Logger;
  readonly #moderationAppeals: ModerationAppealHandler | undefined;
  readonly #repository: TicketRepository;
  readonly #resources: GuildResources;
  #config: TicketConfig = defaultTicketConfig;
  #timer: NodeJS.Timeout | undefined;

  constructor(options: {
    readonly audit: AuditBus;
    readonly guild: Guild;
    readonly initialConfig?: TicketConfig;
    readonly logger: Logger;
    readonly moderationAppeals?: ModerationAppealHandler;
    readonly repository: TicketRepository;
    readonly resources: GuildResources;
  }) {
    this.#audit = options.audit;
    this.#guild = options.guild;
    this.#logger = options.logger;
    this.#moderationAppeals = options.moderationAppeals;
    this.#repository = options.repository;
    this.#resources = options.resources;
    this.#config = ticketConfigSchema.parse(
      options.initialConfig ?? {
        ...defaultTicketConfig,
        staffRoleIds: options.guild.roles.cache
          .filter((role) =>
            ["Владелец", "Куратор", "Модератор", "Испытательный срок"].includes(
              role.name,
            ),
          )
          .map((role) => role.id),
      },
    );
  }

  async start(): Promise<void> {
    await this.#ensurePanel();
    await this.#refreshClosedControls();
    this.#timer = setInterval(() => void this.#closeInactive(), 60_000);
    this.#timer.unref();
  }

  stop(): Promise<void> {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
    return Promise.resolve();
  }

  async apply(config: TicketConfig): Promise<void> {
    this.#config = ticketConfigSchema.parse(config);
    await this.#ensurePanel();
    await this.#refreshClosedControls();
  }

  async handleMessage(message: Message): Promise<boolean> {
    if (message.author.bot) return false;
    const ticket = await this.#repository.findByChannel(message.channelId);
    if (!ticket) return false;
    await this.#repository.touch(message.channelId);
    return true;
  }

  async handleInteraction(interaction: Interaction): Promise<boolean> {
    if (interaction.guildId !== this.#guild.id) return false;
    const customId =
      interaction.isMessageComponent() || interaction.isModalSubmit()
        ? interaction.customId
        : "";
    if (!customId.startsWith("ticket:")) return false;

    if (interaction.isStringSelectMenu() && customId === PANEL_SELECT_ID) {
      const key = interaction.values[0];
      const type = key ? ticketType(this.#config, key) : undefined;
      if (!this.#config.enabled || !type?.enabled) {
        await interaction.reply({
          content: "Этот тип обращения сейчас недоступен.",
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }
      await interaction.showModal(openTicketModal(type.key, type.label));
      return true;
    }

    if (interaction.isModalSubmit() && customId.startsWith(OPEN_MODAL_PREFIX)) {
      await this.#createTicket(
        interaction,
        customId.slice(OPEN_MODAL_PREFIX.length),
      );
      return true;
    }

    const ticket = interaction.channelId
      ? await this.#repository.findByChannel(interaction.channelId)
      : null;
    if (!ticket) {
      if (interaction.isRepliable()) {
        await interaction.reply({
          content: "Тикет для этого канала не найден.",
          flags: MessageFlags.Ephemeral,
        });
      }
      return true;
    }
    const member = await this.#guild.members.fetch(interaction.user.id);
    const staff = this.#isStaff(member);

    if (interaction.isButton() && customId === "ticket:claim") {
      if (!(await this.#requireStaff(interaction, staff))) return true;
      const updated = await this.#repository.claim(ticket.channelId, member.id);
      if (!updated) {
        await interaction.reply({
          content: "Тикет уже назначен или закрыт.",
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }
      await this.#updateControl(updated);
      await interaction.reply({
        content: `Тикет назначен на <@${member.id}>.`,
        flags: MessageFlags.Ephemeral,
      });
      await this.#audit.publish({
        actor: { id: member.id, kind: "user" },
        category: "server",
        discord: true,
        eventType: "ticket.claimed",
        subject: { id: ticket.channelId, kind: "channel" },
        summary: `Тикет #${ticketNumber(ticket.number)} назначен на <@${member.id}>.`,
        title: "Тикет назначен",
      });
      return true;
    }

    if (interaction.isButton() && customId === "ticket:close") {
      if (!staff && interaction.user.id !== ticket.authorId) {
        await interaction.reply({
          content: "Закрыть тикет может его автор или сотрудник.",
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }
      await interaction.showModal(closeTicketModal(ticket, staff));
      return true;
    }

    if (interaction.isModalSubmit() && customId === CLOSE_MODAL_ID) {
      if (!staff && interaction.user.id !== ticket.authorId) {
        await interaction.reply({
          content: "Закрыть тикет может его автор или сотрудник.",
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }
      let appealOutcome: ModerationAppealOutcome | undefined;
      if (ticket.moderationCaseNumber) {
        if (staff) {
          const value = interaction.fields
            .getTextInputValue("appealOutcome")
            .trim()
            .toLocaleLowerCase("ru-RU");
          appealOutcome =
            value === "удовлетворено"
              ? "approved"
              : value === "отклонено"
                ? "denied"
                : undefined;
          if (!appealOutcome) {
            await interaction.reply({
              content: "Введите решение: удовлетворено или отклонено.",
              flags: MessageFlags.Ephemeral,
            });
            return true;
          }
        } else {
          appealOutcome = "withdrawn";
        }
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await this.#closeTicket(
        ticket,
        interaction.fields.getTextInputValue("reason"),
        interaction.user.id,
        appealOutcome,
      );
      await interaction.editReply("Тикет закрыт, транскрипт сохранён.");
      return true;
    }

    if (interaction.isButton() && customId === "ticket:delete") {
      if (!(await this.#requireStaff(interaction, staff))) return true;
      if (ticket.status !== "closed" || ticket.channelDeletedAt) {
        await interaction.reply({
          content: "Удалить можно только канал закрытого тикета.",
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }
      await interaction.showModal(deleteTicketChannelModal(ticket));
      return true;
    }

    if (interaction.isModalSubmit() && customId === DELETE_MODAL_ID) {
      if (!(await this.#requireStaff(interaction, staff))) return true;
      if (ticket.status !== "closed" || ticket.channelDeletedAt) {
        await interaction.reply({
          content: "Канал уже удалён или тикет больше не закрыт.",
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }
      const expected = ticketNumber(ticket.number);
      if (
        interaction.fields.getTextInputValue("ticketNumber").trim() !== expected
      ) {
        await interaction.reply({
          content: `Номер не совпадает. Для подтверждения введите ${expected}.`,
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const channel = await this.#textChannel(ticket.channelId);
      const channelName = channel.name;
      await channel.delete(
        `fxvrlxss_ ticket #${expected} channel deleted by ${interaction.user.id}`,
      );
      const deleted = await this.#repository.markChannelDeleted(
        ticket.channelId,
      );
      if (!deleted) {
        throw new Error(
          `Deleted ticket channel was not marked in database: ${ticket.channelId}`,
        );
      }
      await this.#audit.publish({
        actor: { id: interaction.user.id, kind: "user" },
        category: "server",
        discord: true,
        eventType: "ticket.channel_deleted",
        payload: {
          channelId: ticket.channelId,
          channelName,
          ticketNumber: ticket.number,
        },
        subject: {
          id: ticket.channelId,
          kind: "channel",
          label: channelName,
        },
        summary: describeTicketChannelDeletion({
          channelId: ticket.channelId,
          channelName,
          ticketNumber: ticket.number,
        }),
        title: "Канал тикета удалён",
      });
      await interaction
        .editReply(
          `Канал тикета #${expected} удалён. Запись и транскрипт сохранены.`,
        )
        .catch(() => undefined);
      return true;
    }

    if (interaction.isButton() && customId === "ticket:reopen") {
      if (!(await this.#requireStaff(interaction, staff))) return true;
      if (ticket.moderationCaseNumber) {
        await interaction.reply({
          content:
            "Решение по обжалованию окончательное. Создайте обычный тикет, если требуется дополнительное рассмотрение.",
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }
      const updated = await this.#repository.reopen(ticket.channelId);
      if (!updated) {
        await interaction.reply({
          content: "Тикет уже открыт.",
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }
      await this.#setMemberSendPermissions(updated, true);
      await this.#updateControl(updated);
      await interaction.reply({
        content: "Тикет снова открыт.",
        flags: MessageFlags.Ephemeral,
      });
      await this.#audit.publish({
        actor: { id: member.id, kind: "user" },
        category: "server",
        discord: true,
        eventType: "ticket.reopened",
        subject: { id: ticket.channelId, kind: "channel" },
        summary: `Тикет #${ticketNumber(ticket.number)} открыт повторно.`,
        title: "Тикет открыт повторно",
      });
      return true;
    }

    if (
      interaction.isButton() &&
      [
        "ticket:participant:add:open",
        "ticket:participant:remove:open",
      ].includes(customId)
    ) {
      if (!(await this.#requireStaff(interaction, staff))) return true;
      const adding = customId.includes(":add:");
      const select = new UserSelectMenuBuilder()
        .setCustomId(
          adding ? "ticket:participant:add" : "ticket:participant:remove",
        )
        .setMaxValues(1)
        .setMinValues(1)
        .setPlaceholder(
          adding ? "Кого добавить в тикет" : "Кого удалить из тикета",
        );
      await interaction.reply({
        components: [
          new ContainerBuilder()
            .setAccentColor(0xf2f2ef)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                adding
                  ? "## Добавить участника\nВыберите пользователя, которому нужен доступ к тикету."
                  : "## Удалить участника\nВыберите пользователя, у которого нужно забрать доступ.",
              ),
            )
            .addActionRowComponents(
              new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
                select,
              ),
            ),
        ],
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      });
      return true;
    }

    if (interaction.isUserSelectMenu()) {
      if (!(await this.#requireStaff(interaction, staff))) return true;
      const selected = interaction.users.first();
      if (!selected || selected.bot || selected.id === ticket.authorId) {
        await interaction.reply({
          content: "Выберите обычного участника, который не является автором.",
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }
      const adding = customId === "ticket:participant:add";
      const participants = new Set(ticket.participantIds);
      if (adding) participants.add(selected.id);
      else participants.delete(selected.id);
      const channel = await this.#textChannel(ticket.channelId);
      if (adding) {
        await channel.permissionOverwrites.edit(selected.id, {
          AttachFiles: true,
          ReadMessageHistory: true,
          SendMessages: true,
          ViewChannel: true,
        });
      } else {
        await channel.permissionOverwrites.delete(selected.id);
      }
      await this.#repository.setParticipants(ticket.channelId, [
        ...participants,
      ]);
      await interaction.update({
        components: [
          new ContainerBuilder()
            .setAccentColor(0xf2f2ef)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `## Готово\n${adding ? "Добавлен" : "Удалён"} <@${selected.id}>.`,
              ),
            ),
        ],
      });
      await this.#audit.publish({
        actor: { id: member.id, kind: "user" },
        category: "server",
        discord: true,
        eventType: adding
          ? "ticket.participant_added"
          : "ticket.participant_removed",
        subject: { id: ticket.channelId, kind: "channel" },
        summary: `${adding ? "Добавлен" : "Удалён"} участник <@${selected.id}> в тикете #${ticketNumber(ticket.number)}.`,
        title: adding
          ? "Участник добавлен в тикет"
          : "Участник удалён из тикета",
      });
      return true;
    }

    return true;
  }

  async #ensurePanel(): Promise<void> {
    const channel = await this.#textChannel(
      this.#resources.channels.support.openTicket,
    );
    const pins = await channel.messages.fetchPins({ limit: 50 });
    const existing = pins.items
      .map(({ message }) => message)
      .find(
        (message) =>
          message.author.id === this.#guild.client.user.id &&
          JSON.stringify(
            message.components.map((item) => item.toJSON()),
          ).includes(PANEL_SELECT_ID),
      );
    if (existing) {
      await existing.edit({
        allowedMentions: { parse: [] },
        components: buildTicketPanel(this.#config),
        flags: MessageFlags.IsComponentsV2,
      });
      return;
    }
    const panel = await channel.send({
      allowedMentions: { parse: [] },
      components: buildTicketPanel(this.#config),
      flags: MessageFlags.IsComponentsV2,
    });
    await panel.pin("fxvrlxss_ ticket panel");
  }

  async #createTicket(
    interaction: Extract<Interaction, { fields: unknown }>,
    typeKey: string,
  ): Promise<void> {
    const type = ticketType(this.#config, typeKey);
    if (
      !this.#config.enabled ||
      !type?.enabled ||
      !interaction.isModalSubmit()
    ) {
      await interaction.reply({
        content: "Этот тип обращения сейчас недоступен.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const moderationCaseNumber =
      type.key === "punishment-appeal"
        ? Number(interaction.fields.getTextInputValue("caseNumber"))
        : undefined;
    if (
      moderationCaseNumber !== undefined &&
      (!Number.isInteger(moderationCaseNumber) ||
        moderationCaseNumber < 1 ||
        !this.#moderationAppeals ||
        !(await this.#moderationAppeals.canAppeal(
          moderationCaseNumber,
          interaction.user.id,
        )))
    ) {
      await interaction.editReply(
        "Активное дело с таким номером не найдено или оно принадлежит другому участнику.",
      );
      return;
    }
    const reservation = await this.#repository.reserve({
      authorId: interaction.user.id,
      description: interaction.fields.getTextInputValue("description"),
      guildId: this.#guild.id,
      maxOpenTickets: this.#config.maxOpenTicketsPerUser,
      ...(moderationCaseNumber === undefined ? {} : { moderationCaseNumber }),
      subject: interaction.fields.getTextInputValue("subject"),
      type: type.key,
    });
    if (!reservation.success) {
      await interaction.editReply(
        reservation.reason === "duplicate-type"
          ? "У вас уже есть открытый тикет этого типа."
          : `Достигнут лимит открытых тикетов: ${this.#config.maxOpenTicketsPerUser}.`,
      );
      return;
    }

    let channel: TextChannel | undefined;
    try {
      channel = await this.#guild.channels.create({
        name: `тикет-${ticketNumber(reservation.record.number)}`,
        parent: this.#resources.channels.support.category,
        permissionOverwrites: [
          {
            deny: [PermissionFlagsBits.ViewChannel],
            id: this.#guild.roles.everyone.id,
          },
          {
            allow: [
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ViewChannel,
            ],
            id: interaction.user.id,
          },
          ...this.#config.staffRoleIds
            .filter((id) => this.#guild.roles.cache.has(id))
            .map((id) => ({
              allow: [
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ViewChannel,
              ],
              id,
            })),
        ],
        reason: `fxvrlxss_ ticket #${reservation.record.number}`,
        topic: `Тикет #${ticketNumber(reservation.record.number)} · ${type.label} · ${interaction.user.id}`,
        type: ChannelType.GuildText,
      });
      const active = await this.#repository.activate(
        reservation.record.id,
        channel.id,
      );
      const control = await channel.send({
        allowedMentions: { users: [interaction.user.id] },
        components: buildTicketControls(active, this.#config),
        flags: MessageFlags.IsComponentsV2,
      });
      await this.#repository.setControlMessage(channel.id, control.id);
      if (
        moderationCaseNumber !== undefined &&
        !(await this.#moderationAppeals?.beginAppeal(
          moderationCaseNumber,
          interaction.user.id,
        ))
      ) {
        throw new Error(
          `Moderation case #${moderationCaseNumber} could not begin appeal`,
        );
      }
      await interaction.editReply(`Тикет создан: <#${channel.id}>`);
      await this.#audit.publish({
        actor: { id: interaction.user.id, kind: "user" },
        category: "server",
        discord: true,
        eventType: "ticket.opened",
        subject: { id: channel.id, kind: "channel" },
        summary: `Открыт тикет #${ticketNumber(active.number)} · ${escapeMarkdown(type.label)}. Автор: <@${interaction.user.id}>.`,
        title: "Тикет открыт",
      });
    } catch (error) {
      if (channel)
        await channel.delete("Ticket creation failed").catch(() => undefined);
      await this.#repository.abandon(reservation.record.id);
      throw error;
    }
  }

  #isStaff(member: GuildMember): boolean {
    return (
      member.permissions.has(PermissionFlagsBits.Administrator) ||
      member.roles.cache.some((role) =>
        this.#config.staffRoleIds.includes(role.id),
      )
    );
  }

  async #requireStaff(
    interaction: Extract<Interaction, { reply: unknown }>,
    staff: boolean,
  ): Promise<boolean> {
    if (staff) return true;
    if (interaction.isRepliable()) {
      await interaction.reply({
        content: "Это действие доступно только команде сервера.",
        flags: MessageFlags.Ephemeral,
      });
    }
    return false;
  }

  async #textChannel(channelId: string): Promise<TextChannel> {
    const channel = await this.#guild.channels.fetch(channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      throw new Error(`Ticket text channel is unavailable: ${channelId}`);
    }
    return channel;
  }

  async #updateControl(ticket: TicketRecord): Promise<void> {
    if (!ticket.controlMessageId) return;
    const channel = await this.#textChannel(ticket.channelId);
    await channel.messages.edit(ticket.controlMessageId, {
      allowedMentions: { parse: [] },
      components: buildTicketControls(ticket, this.#config),
      flags: MessageFlags.IsComponentsV2,
    });
  }

  async #refreshClosedControls(): Promise<void> {
    const tickets = await this.#repository.findClosedWithChannels(
      this.#guild.id,
    );
    for (const ticket of tickets) {
      try {
        await this.#updateControl(ticket);
      } catch (error) {
        if (isUnknownDiscordChannel(error)) {
          await this.#repository.markChannelDeleted(ticket.channelId);
          this.#logger.info(
            { channelId: ticket.channelId, ticketNumber: ticket.number },
            "missing closed ticket channel marked as deleted",
          );
          continue;
        }
        this.#logger.error(
          { channelId: ticket.channelId, error, ticketNumber: ticket.number },
          "closed ticket controls refresh failed",
        );
      }
    }
  }

  async #setMemberSendPermissions(
    ticket: TicketRecord,
    enabled: boolean,
  ): Promise<void> {
    const channel = await this.#textChannel(ticket.channelId);
    for (const userId of [ticket.authorId, ...ticket.participantIds]) {
      await channel.permissionOverwrites.edit(userId, {
        SendMessages: enabled,
        ViewChannel: true,
      });
    }
  }

  async #closeTicket(
    ticket: TicketRecord,
    reason: string,
    actorId?: string,
    appealOutcome?: ModerationAppealOutcome,
  ): Promise<void> {
    if (!ACTIVE_STATES.has(ticket.status)) return;
    const channel = await this.#textChannel(ticket.channelId);
    const snapshot = this.#config.transcriptEnabled
      ? await transcript(channel)
      : null;
    const closed = await this.#repository.close(
      ticket.channelId,
      reason,
      snapshot,
    );
    if (!closed) return;
    await this.#setMemberSendPermissions(closed, false);
    await this.#updateControl(closed);
    await channel.send({
      allowedMentions: { parse: [] },
      components: [
        new ContainerBuilder()
          .setAccentColor(0x737370)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `## Тикет закрыт\nПричина: ${escapeMarkdown(reason)}`,
            ),
          ),
      ],
      flags: MessageFlags.IsComponentsV2,
    });
    if (snapshot) {
      try {
        await this.#publishTranscript(closed, reason, snapshot);
      } catch (error) {
        this.#logger.error(
          { channelId: ticket.channelId, error },
          "ticket transcript Discord delivery failed",
        );
        await this.#audit.publish({
          category: "bot",
          discord: true,
          eventType: "ticket.transcript_delivery_failed",
          payload: { error: String(error), ticketNumber: ticket.number },
          severity: "critical",
          subject: { id: ticket.channelId, kind: "channel" },
          summary: `Не удалось отправить транскрипт тикета #${ticketNumber(ticket.number)} в Discord. Копия сохранена в PostgreSQL.`,
          title: "Ошибка отправки транскрипта",
        });
      }
    }
    await this.#audit.publish({
      ...(actorId ? { actor: { id: actorId, kind: "user" } as const } : {}),
      category: "server",
      discord: true,
      eventType: "ticket.closed",
      payload: { reason, transcriptEntries: snapshot?.length ?? 0 },
      subject: { id: ticket.channelId, kind: "channel" },
      summary: `Закрыт тикет #${ticketNumber(ticket.number)}. Причина: ${escapeMarkdown(reason)}.`,
      title: "Тикет закрыт",
    });
    if (closed.moderationCaseNumber && this.#moderationAppeals) {
      try {
        const finished = await this.#moderationAppeals.finishAppeal({
          actorId: actorId ?? this.#guild.client.user.id,
          caseNumber: closed.moderationCaseNumber,
          outcome: appealOutcome ?? "withdrawn",
          reason,
        });
        if (!finished) {
          throw new Error("Связанное дело уже не находится на обжаловании");
        }
      } catch (error) {
        this.#logger.error(
          {
            error,
            moderationCaseNumber: closed.moderationCaseNumber,
            ticketNumber: closed.number,
          },
          "moderation appeal resolution failed",
        );
        await this.#audit.publish({
          category: "bot",
          discord: true,
          eventType: "moderation.appeal_resolution_failed",
          payload: {
            error: String(error),
            moderationCaseNumber: closed.moderationCaseNumber,
            ticketNumber: closed.number,
          },
          severity: "critical",
          subject: { id: closed.channelId, kind: "channel" },
          summary: `Тикет #${ticketNumber(closed.number)} закрыт, но не удалось завершить обжалование по делу #${ticketNumber(closed.moderationCaseNumber)}. Требуется ручная проверка.`,
          title: "Ошибка завершения обжалования",
        });
      }
    }
  }

  async #publishTranscript(
    ticket: TicketRecord,
    reason: string,
    entries: readonly TicketTranscriptEntry[],
  ): Promise<void> {
    const channel = await this.#textChannel(
      this.#resources.channels.team.ticketDiscussions,
    );
    const type = ticketType(this.#config, ticket.type);
    const files = buildTicketTranscriptFiles(
      ticket,
      {
        closedAt: new Date(),
        reason,
        typeLabel: type?.label ?? ticket.type,
      },
      entries,
    );
    const batchSize = 9;
    for (let index = 0; index < files.length; index += batchSize) {
      const batch = files.slice(index, index + batchSize);
      const first = index === 0;
      const container = new ContainerBuilder()
        .setAccentColor(0x737370)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            first
              ? [
                  `## Транскрипт тикета #${ticketNumber(ticket.number)}`,
                  `Тип: ${escapeMarkdown(type?.label ?? ticket.type)}`,
                  `Автор: <@${ticket.authorId}>`,
                  `Канал: <#${ticket.channelId}>`,
                  `Причина закрытия: ${escapeMarkdown(reason)}`,
                  `Сообщений: ${countReadableTicketTranscriptEntries(entries)} · файлов: ${files.length}`,
                ].join("\n")
              : `## Транскрипт тикета #${ticketNumber(ticket.number)} · продолжение`,
          ),
        );
      for (const file of batch) {
        container.addFileComponents(
          new FileBuilder().setURL(`attachment://${file.name}`),
        );
      }
      await channel.send({
        allowedMentions: { parse: [] },
        components: [container],
        files: batch.map(
          (file) =>
            new AttachmentBuilder(file.data, {
              description: `Транскрипт тикета #${ticketNumber(ticket.number)}`,
              name: file.name,
            }),
        ),
        flags: MessageFlags.IsComponentsV2,
      });
    }
  }

  async #closeInactive(): Promise<void> {
    if (!this.#config.enabled || this.#config.autoCloseHours === 0) return;
    const cutoff = new Date(
      Date.now() - this.#config.autoCloseHours * 60 * 60 * 1_000,
    );
    const inactive = await this.#repository.findInactive(
      this.#guild.id,
      cutoff,
    );
    for (const ticket of inactive) {
      try {
        await this.#closeTicket(
          ticket,
          `Нет активности ${this.#config.autoCloseHours} ч.`,
        );
      } catch (error) {
        this.#logger.error(
          { channelId: ticket.channelId, error },
          "inactive ticket close failed",
        );
      }
    }
  }
}
