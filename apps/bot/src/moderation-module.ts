import {
  decideModerationAction,
  defaultModerationConfig,
  moderationActionSchema,
  moderationConfigSchema,
  type ModerationAction,
  type ModerationConfig,
} from "@fxvrlxss/domain/moderation-config";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  escapeMarkdown,
  type Guild,
  type GuildMember,
  type Interaction,
  type Message,
} from "discord.js";
import type { Logger } from "pino";

import type { AuditBus } from "./audit.js";
import {
  assessModerationAppeal,
  type ModerationAppealHandler,
  type ModerationAppealOutcome,
} from "./moderation-appeals.js";
import type { ModerationConfigurationApplier } from "./moderation-publication.js";
import type {
  ModerationCaseRecord,
  ModerationRepository,
} from "./moderation-repository.js";

const COMMAND_NAME = "модерация";
const actionLabels: Readonly<Record<ModerationAction, string>> = {
  ban: "Бан",
  kick: "Кик",
  timeout: "Тайм-аут",
  warn: "Предупреждение",
};

export type AutomatedModerationAction =
  "observe" | "points" | "timeout" | "quarantine" | "kick" | "ban";

export interface AutomodViolationInput {
  readonly action: AutomatedModerationAction;
  readonly applyThresholds: boolean;
  readonly channelId: string;
  readonly deleteMessage: boolean;
  readonly message?: Message;
  readonly messageId: string | null;
  readonly points: number;
  readonly signals: readonly string[];
  readonly sourceEventKey: string;
  readonly summary: string;
  readonly timeoutMinutes: number;
  readonly userId: string;
}

export interface AutomodViolationResult {
  readonly activePoints: number;
  readonly appliedAction: string;
  readonly caseNumber: number | null;
}

export type ModerationNoticeAction =
  "ban" | "kick" | "points" | "quarantine" | "timeout" | "warn";

const automatedActionLabels: Readonly<
  Record<AutomatedModerationAction, string>
> = {
  ban: "бан",
  kick: "кик",
  observe: "наблюдение",
  points: "начисление баллов",
  quarantine: "карантин",
  timeout: "тайм-аут",
};

function caseActionLabel(item: ModerationCaseRecord): string {
  if (
    item.evidence.source === "automod" &&
    item.evidence.automodAction &&
    item.evidence.automodAction in automatedActionLabels
  ) {
    const action =
      automatedActionLabels[
        item.evidence.automodAction as AutomatedModerationAction
      ];
    return `Автомод · ${action}${item.evidence.messageDeleted ? " + удаление сообщения" : ""}`;
  }
  return actionLabels[item.appliedAction];
}

function caseNumber(value: number): string {
  return String(value).padStart(4, "0");
}

export function buildModerationNotice(input: {
  readonly action: ModerationNoticeAction;
  readonly appealUrl?: string;
  readonly caseNumber: number | null;
  readonly points: number;
  readonly serverName: string;
  readonly summary: string;
  readonly timeoutMinutes?: number | null;
}): string {
  const server = `**${escapeMarkdown(input.serverName)}**`;
  const opening = (() => {
    switch (input.action) {
      case "ban":
        return `Вы получили бан на сервере ${server}.`;
      case "kick":
        return `Вас исключили с сервера ${server}.`;
      case "points":
        return `Вы получили **${input.points} ${pointWord(input.points)}** на сервере ${server}.`;
      case "quarantine":
        return `Вы попали в карантин на сервере ${server}.`;
      case "timeout":
        return `Вы получили тайм-аут на сервере ${server}${input.timeoutMinutes ? ` на **${input.timeoutMinutes} мин.**` : ""}.`;
      case "warn":
        return `Вы получили предупреждение на сервере ${server}.`;
    }
  })();
  const summary = escapeMarkdown(input.summary.trim());
  const reason = `Причина — ${summary}${/[.!?…]$/u.test(summary) ? "" : "."}`;
  return [
    opening,
    reason,
    input.caseNumber ? `Дело: **#${caseNumber(input.caseNumber)}**` : undefined,
    input.caseNumber && input.appealUrl
      ? `\nПодать апелляцию: ${input.appealUrl}`
      : undefined,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function pointWord(value: number): string {
  const remainder100 = Math.abs(value) % 100;
  const remainder10 = remainder100 % 10;
  if (remainder100 >= 11 && remainder100 <= 14) return "баллов";
  if (remainder10 === 1) return "балл";
  if (remainder10 >= 2 && remainder10 <= 4) return "балла";
  return "баллов";
}

function actionButton(action: ModerationAction, userId: string): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(`moderation:apply:open:${action}:${userId}`)
    .setLabel(actionLabels[action])
    .setStyle(
      action === "ban"
        ? ButtonStyle.Danger
        : action === "warn"
          ? ButtonStyle.Secondary
          : ButtonStyle.Primary,
    );
}

export function buildModerationCard(input: {
  readonly activePoints: number;
  readonly cases: readonly ModerationCaseRecord[];
  readonly userId: string;
}): ContainerBuilder[] {
  const latest = input.cases[0];
  return [
    new ContainerBuilder()
      .setAccentColor(0xf2f2ef)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            "## Карточка участника",
            `Участник: <@${input.userId}>`,
            `Активные баллы: **${input.activePoints}**`,
            latest
              ? `Последнее дело: **#${caseNumber(latest.number)}** · ${caseActionLabel(latest)}`
              : "История наказаний пуста.",
          ].join("\n"),
        ),
      )
      .addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          actionButton("warn", input.userId),
          actionButton("timeout", input.userId),
          actionButton("kick", input.userId),
          actionButton("ban", input.userId),
          new ButtonBuilder()
            .setCustomId(`moderation:history:${input.userId}`)
            .setLabel("История")
            .setStyle(ButtonStyle.Secondary),
        ),
      ),
  ];
}

function buildModerationHistory(input: {
  readonly activePoints: number;
  readonly cases: readonly ModerationCaseRecord[];
  readonly userId: string;
}): ContainerBuilder[] {
  const lines = input.cases.map((item) => {
    const state =
      item.status === "resolved"
        ? "отменено"
        : item.status === "appealed"
          ? "обжалуется"
          : "активно";
    return `**#${caseNumber(item.number)}** · ${caseActionLabel(item)} · ${item.points} б. · ${state} · <t:${Math.floor(item.createdAt.getTime() / 1_000)}:f>`;
  });
  const container = new ContainerBuilder()
    .setAccentColor(0xf2f2ef)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "## История модерации",
          `Участник: <@${input.userId}> · активные баллы: **${input.activePoints}**`,
          lines.length > 0 ? lines.join("\n") : "Дел пока нет.",
        ].join("\n\n"),
      ),
    );
  const active = input.cases
    .filter((item) => item.status === "open")
    .slice(0, 5);
  if (active.length > 0) {
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...active.map((item) =>
          new ButtonBuilder()
            .setCustomId(`moderation:revoke:open:${item.number}`)
            .setLabel(`Отменить #${caseNumber(item.number)}`)
            .setStyle(ButtonStyle.Secondary),
        ),
      ),
    );
  }
  return [container];
}

function actionModal(
  action: ModerationAction,
  userId: string,
  config: ModerationConfig,
): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`moderation:apply:submit:${action}:${userId}`)
    .setTitle(actionLabels[action])
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Причина")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("reason")
            .setMaxLength(1_000)
            .setMinLength(3)
            .setRequired(true)
            .setStyle(TextInputStyle.Paragraph),
        ),
      new LabelBuilder()
        .setLabel("Доказательство или ссылка")
        .setDescription("Необязательно. Можно указать ссылку на сообщение.")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("evidence")
            .setMaxLength(500)
            .setRequired(false)
            .setStyle(TextInputStyle.Paragraph),
        ),
    );
  if (action === "timeout") {
    modal.addLabelComponents(
      new LabelBuilder()
        .setLabel("Срок тайм-аута, минут")
        .setDescription("От 1 минуты до 28 дней.")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("timeoutMinutes")
            .setMaxLength(5)
            .setMinLength(1)
            .setRequired(true)
            .setStyle(TextInputStyle.Short)
            .setValue(String(config.defaultTimeoutMinutes)),
        ),
    );
  }
  return modal;
}

function revokeModal(item: ModerationCaseRecord): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`moderation:revoke:submit:${item.number}`)
    .setTitle(`Отменить дело #${caseNumber(item.number)}`)
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Причина отмены")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("reason")
            .setMaxLength(1_000)
            .setMinLength(3)
            .setRequired(true)
            .setStyle(TextInputStyle.Paragraph),
        ),
    );
}

async function registerModerationCommand(guild: Guild): Promise<void> {
  const command = new SlashCommandBuilder()
    .setName(COMMAND_NAME)
    .setDescription("Открыть карточку модерации участника")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) =>
      option
        .setName("участник")
        .setDescription("Участник сервера")
        .setRequired(true),
    );
  const commands = await guild.commands.fetch();
  const existing = commands.find(
    (candidate) => candidate.name === command.name,
  );
  if (existing) await guild.commands.edit(existing.id, command);
  else await guild.commands.create(command);
}

export class ModerationModule
  implements ModerationConfigurationApplier, ModerationAppealHandler
{
  readonly #appealInviteUrl: string | undefined;
  readonly #audit: AuditBus;
  readonly #automodQueues = new Map<string, Promise<void>>();
  readonly #guild: Guild;
  readonly #logger: Logger;
  readonly #quarantineRoleId: string;
  readonly #repository: ModerationRepository;
  readonly #ticketUrl: string;
  #config: ModerationConfig;

  constructor(options: {
    readonly appealInviteUrl?: string;
    readonly audit: AuditBus;
    readonly guild: Guild;
    readonly logger: Logger;
    readonly quarantineRoleId: string;
    readonly repository: ModerationRepository;
    readonly ticketChannelId: string;
  }) {
    this.#appealInviteUrl = options.appealInviteUrl;
    this.#audit = options.audit;
    this.#guild = options.guild;
    this.#logger = options.logger;
    this.#quarantineRoleId = options.quarantineRoleId;
    this.#repository = options.repository;
    this.#ticketUrl = `https://discord.com/channels/${options.guild.id}/${options.ticketChannelId}`;
    this.#config = {
      ...defaultModerationConfig,
      staffRoleIds: options.guild.roles.cache
        .filter((role) =>
          ["Владелец", "Куратор", "Модератор", "Испытательный срок"].includes(
            role.name,
          ),
        )
        .map((role) => role.id),
    };
  }

  async start(): Promise<void> {
    await registerModerationCommand(this.#guild);
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.#automodQueues.values()]);
  }

  apply(config: ModerationConfig): Promise<void> {
    this.#config = moderationConfigSchema.parse(config);
    return Promise.resolve();
  }

  applyAutomodViolation(
    input: AutomodViolationInput,
  ): Promise<AutomodViolationResult> {
    const previous = this.#automodQueues.get(input.userId) ?? Promise.resolve();
    const operation = previous.then(
      () => this.#applyAutomodViolation(input),
      () => this.#applyAutomodViolation(input),
    );
    const tail = operation.then(
      () => undefined,
      () => undefined,
    );
    this.#automodQueues.set(input.userId, tail);
    void tail.finally(() => {
      if (this.#automodQueues.get(input.userId) === tail) {
        this.#automodQueues.delete(input.userId);
      }
    });
    return operation;
  }

  async #applyAutomodViolation(
    input: AutomodViolationInput,
  ): Promise<AutomodViolationResult> {
    const previousPoints = await this.#repository.activePoints(
      this.#guild.id,
      input.userId,
      new Date(),
    );
    const activePoints = previousPoints + input.points;
    const requestedAction: ModerationAction =
      input.action === "timeout" ||
      input.action === "kick" ||
      input.action === "ban"
        ? input.action
        : "warn";
    const decision =
      input.applyThresholds && input.points > 0
        ? decideModerationAction({
            activePoints,
            config: this.#config,
            requestedAction,
            ...(requestedAction === "timeout"
              ? { requestedTimeoutMinutes: input.timeoutMinutes }
              : {}),
          })
        : {
            action: requestedAction,
            escalated: false,
            timeoutMinutes:
              requestedAction === "timeout" ? input.timeoutMinutes : null,
          };
    const tracked =
      input.points > 0 ||
      ["timeout", "quarantine", "kick", "ban"].includes(input.action);
    let item: ModerationCaseRecord | undefined;
    if (tracked) {
      const creation = await this.#repository.create({
        appliedAction: decision.action,
        evidence: {
          automodAction: input.action,
          channelId: input.channelId,
          messageDeleted: input.deleteMessage,
          ...(input.messageId ? { messageId: input.messageId } : {}),
          reference: input.messageId
            ? `https://discord.com/channels/${this.#guild.id}/${input.channelId}/${input.messageId}`
            : null,
          signals: input.signals,
          source: "automod",
        },
        expiresAt: new Date(
          Date.now() + this.#config.pointExpiryDays * 86_400_000,
        ),
        guildId: this.#guild.id,
        moderatorId: this.#guild.client.user.id,
        points: input.points,
        requestedAction,
        sourceEventKey: input.sourceEventKey,
        summary: input.summary,
        timeoutMinutes: decision.timeoutMinutes,
        userId: input.userId,
      });
      item = creation.record;
      if (!creation.created) {
        return {
          activePoints: previousPoints,
          appliedAction: caseActionLabel(item),
          caseNumber: item.number,
        };
      }
    }

    const primaryAction =
      decision.action !== "warn"
        ? actionLabels[decision.action]
        : automatedActionLabels[input.action];
    const appliedAction = input.deleteMessage
      ? input.action === "observe" && decision.action === "warn"
        ? "удаление сообщения"
        : `${primaryAction} + удаление сообщения`
      : primaryAction;
    if (item) {
      await this.#notifyMember({
        action:
          decision.action !== "warn"
            ? decision.action
            : input.action === "points" || input.action === "quarantine"
              ? input.action
              : "warn",
        caseNumber: item.number,
        channelId: input.channelId,
        points: input.points,
        summary: input.summary,
        timeoutMinutes: decision.timeoutMinutes,
        userId: input.userId,
      });
    }

    try {
      if (input.message && input.deleteMessage) {
        if (!input.message.deletable) {
          throw new Error("Сообщение нельзя удалить");
        }
        await input.message.delete();
      }
      const target =
        input.action === "quarantine" || decision.action !== "warn"
          ? await this.#guild.members.fetch(input.userId)
          : undefined;
      if (
        input.action === "quarantine" &&
        decision.action !== "kick" &&
        decision.action !== "ban"
      ) {
        if (!target) throw new Error("Участник не найден");
        if (!target.manageable) {
          throw new Error("Участнику нельзя назначить карантин");
        }
        await target.roles.add(
          this.#quarantineRoleId,
          `fxvrlxss_ automod: ${input.summary}`.slice(0, 500),
        );
      }
      if (decision.action !== "warn") {
        if (!target) throw new Error("Участник не найден");
        await this.#applyDiscordAction(
          target,
          decision.action,
          input.summary,
          decision.timeoutMinutes,
        );
      }
    } catch (error) {
      if (item) {
        await this.#repository.resolve({
          guildId: this.#guild.id,
          number: item.number,
          reason: `Действие автомода не применено: ${error instanceof Error ? error.message : String(error)}`,
          resolvedById: this.#guild.client.user.id,
        });
      }
      throw error;
    }

    if (item) {
      await this.#audit.publish({
        actor: { id: this.#guild.client.user.id, kind: "user" },
        category: "moderation",
        discord: true,
        eventType: "moderation.automod_case_created",
        payload: {
          action: input.action,
          activePoints,
          appliedAction: decision.action,
          deleteMessage: input.deleteMessage,
          points: input.points,
          signals: input.signals,
        },
        severity:
          decision.action === "ban" || decision.action === "kick"
            ? "warning"
            : "info",
        subject: { id: input.userId, kind: "user" },
        summary: [
          `Дело: **#${caseNumber(item.number)}** · источник: автомод`,
          `Участник: <@${input.userId}>`,
          `Флаги: ${input.signals.join(", ")}`,
          `Действие: **${appliedAction}**`,
          `Баллы: +${input.points} · активно ${activePoints}`,
          `Причина: ${escapeMarkdown(input.summary)}`,
        ].join("\n"),
        title: `Автомод · дело #${caseNumber(item.number)}`,
      });
    }
    return {
      activePoints,
      appliedAction,
      caseNumber: item?.number ?? null,
    };
  }

  async checkAppeal(number: number, userId: string) {
    const item = await this.#repository.findByNumber(this.#guild.id, number);
    return assessModerationAppeal(item, userId);
  }

  async beginAppeal(number: number, userId: string): Promise<boolean> {
    return Boolean(
      await this.#repository.beginAppeal({
        guildId: this.#guild.id,
        number,
        userId,
      }),
    );
  }

  async finishAppeal(input: {
    readonly actorId: string;
    readonly caseNumber: number;
    readonly outcome: ModerationAppealOutcome;
    readonly reason: string;
  }): Promise<boolean> {
    const item = await this.#repository.findByNumber(
      this.#guild.id,
      input.caseNumber,
    );
    if (!item || item.status !== "appealed") return false;
    if (input.outcome === "approved") {
      await this.#reverseDiscordAction(item, input.reason);
    }
    const updated = await this.#repository.finishAppeal({
      guildId: this.#guild.id,
      number: input.caseNumber,
      outcome: input.outcome,
      reason: input.reason,
      resolvedById: input.actorId,
    });
    if (!updated) return false;
    const outcomeLabel =
      input.outcome === "approved"
        ? "удовлетворено"
        : input.outcome === "denied"
          ? "отклонено"
          : "отозвано автором";
    await this.#audit.publish({
      actor: { id: input.actorId, kind: "user" },
      category: "moderation",
      discord: true,
      eventType: "moderation.appeal_resolved",
      payload: { outcome: input.outcome, reason: input.reason },
      subject: { id: item.userId, kind: "user" },
      summary: [
        `Дело: **#${caseNumber(item.number)}**`,
        `Участник: <@${item.userId}>`,
        `Результат: **${outcomeLabel}**`,
        `Решение: ${escapeMarkdown(input.reason)}`,
      ].join("\n"),
      title: `Обжалование по делу #${caseNumber(item.number)}`,
    });
    return true;
  }

  async handleInteraction(interaction: Interaction): Promise<boolean> {
    if (interaction.guildId !== this.#guild.id) return false;
    if (
      interaction.isChatInputCommand() &&
      interaction.commandName === COMMAND_NAME
    ) {
      const moderator = await this.#guild.members.fetch(interaction.user.id);
      if (!(await this.#requireStaff(interaction, moderator))) return true;
      if (!this.#config.enabled) {
        await interaction.reply({
          content: "Модуль ручной модерации отключён.",
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }
      const user = interaction.options.getUser("участник", true);
      const target = await this.#guild.members.fetch(user.id);
      if (!(await this.#validateTarget(interaction, moderator, target))) {
        return true;
      }
      const [points, cases] = await Promise.all([
        this.#repository.activePoints(this.#guild.id, target.id, new Date()),
        this.#repository.listForUser(this.#guild.id, target.id, 10),
      ]);
      await interaction.reply({
        allowedMentions: { parse: [] },
        components: buildModerationCard({
          activePoints: points,
          cases,
          userId: target.id,
        }),
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      });
      return true;
    }

    const customId =
      interaction.isMessageComponent() || interaction.isModalSubmit()
        ? interaction.customId
        : "";
    if (!customId.startsWith("moderation:")) return false;
    const moderator = await this.#guild.members.fetch(interaction.user.id);
    if (!(await this.#requireStaff(interaction, moderator))) return true;

    const parts = customId.split(":");
    if (interaction.isButton() && parts[1] === "apply" && parts[2] === "open") {
      const parsedAction = moderationActionSchema.safeParse(parts[3]);
      const userId = parts[4];
      if (!parsedAction.success || !userId) return true;
      await interaction.showModal(
        actionModal(parsedAction.data, userId, this.#config),
      );
      return true;
    }

    if (interaction.isButton() && parts[1] === "history") {
      const userId = parts[2];
      if (!userId) return true;
      const [points, cases] = await Promise.all([
        this.#repository.activePoints(this.#guild.id, userId, new Date()),
        this.#repository.listForUser(this.#guild.id, userId, 10),
      ]);
      await interaction.update({
        allowedMentions: { parse: [] },
        components: buildModerationHistory({
          activePoints: points,
          cases,
          userId,
        }),
      });
      return true;
    }

    if (
      interaction.isModalSubmit() &&
      parts[1] === "apply" &&
      parts[2] === "submit"
    ) {
      const parsedAction = moderationActionSchema.safeParse(parts[3]);
      const userId = parts[4];
      if (!parsedAction.success || !userId) return true;
      await this.#applyCase(interaction, moderator, userId, parsedAction.data);
      return true;
    }

    if (
      interaction.isButton() &&
      parts[1] === "revoke" &&
      parts[2] === "open"
    ) {
      const number = Number(parts[3]);
      const item = await this.#repository.findByNumber(this.#guild.id, number);
      if (!item || item.status === "resolved") {
        await interaction.reply({
          content: "Дело уже отменено или не найдено.",
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }
      if (item.status === "appealed") {
        await interaction.reply({
          content:
            "Дело сейчас рассматривается в тикете обжалования. Решение нужно принять при закрытии тикета.",
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }
      await interaction.showModal(revokeModal(item));
      return true;
    }

    if (
      interaction.isModalSubmit() &&
      parts[1] === "revoke" &&
      parts[2] === "submit"
    ) {
      await this.#revokeCase(interaction, Number(parts[3]));
      return true;
    }
    return true;
  }

  async #applyCase(
    interaction: Extract<Interaction, { fields: unknown }>,
    moderator: GuildMember,
    userId: string,
    requestedAction: ModerationAction,
  ): Promise<void> {
    const target = await this.#guild.members.fetch(userId);
    if (!(await this.#validateTarget(interaction, moderator, target))) return;
    const reason = interaction.fields.getTextInputValue("reason").trim();
    const evidence = interaction.fields.getTextInputValue("evidence").trim();
    const requestedTimeoutMinutes =
      requestedAction === "timeout"
        ? Number(interaction.fields.getTextInputValue("timeoutMinutes"))
        : undefined;
    if (
      requestedTimeoutMinutes !== undefined &&
      (!Number.isInteger(requestedTimeoutMinutes) ||
        requestedTimeoutMinutes < 1 ||
        requestedTimeoutMinutes > 40_320)
    ) {
      await interaction.reply({
        content: "Срок тайм-аута должен быть от 1 до 40320 минут.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const points = requestedAction === "warn" ? 1 : 0;
    const previousPoints = await this.#repository.activePoints(
      this.#guild.id,
      userId,
      new Date(),
    );
    const activePoints = previousPoints + points;
    const decision =
      requestedAction === "warn"
        ? decideModerationAction({
            activePoints,
            config: this.#config,
            requestedAction,
          })
        : {
            action: requestedAction,
            escalated: false,
            timeoutMinutes:
              requestedAction === "timeout"
                ? (requestedTimeoutMinutes ??
                  this.#config.defaultTimeoutMinutes)
                : null,
          };
    let item: ModerationCaseRecord | undefined;
    try {
      item = (
        await this.#repository.create({
          appliedAction: decision.action,
          evidence: { reference: evidence || null },
          expiresAt: new Date(
            Date.now() + this.#config.pointExpiryDays * 86_400_000,
          ),
          guildId: this.#guild.id,
          moderatorId: moderator.id,
          points,
          requestedAction,
          summary: reason,
          timeoutMinutes: decision.timeoutMinutes,
          userId,
        })
      ).record;
      await this.#notifyMember({
        action: decision.action,
        caseNumber: item.number,
        ...(interaction.channelId ? { channelId: interaction.channelId } : {}),
        points,
        summary: reason,
        timeoutMinutes: decision.timeoutMinutes,
        userId,
      });
      try {
        await this.#applyDiscordAction(
          target,
          decision.action,
          reason,
          decision.timeoutMinutes,
        );
      } catch (error) {
        await this.#repository.resolve({
          guildId: this.#guild.id,
          number: item.number,
          reason: `Действие не применено: ${error instanceof Error ? error.message : String(error)}`,
          resolvedById: this.#guild.client.user.id,
        });
        throw error;
      }
      await this.#audit.publish({
        actor: { id: moderator.id, kind: "user" },
        category: "moderation",
        discord: true,
        eventType: "moderation.case_created",
        payload: {
          activePoints,
          appliedAction: decision.action,
          evidence: evidence || null,
          points,
          requestedAction,
          timeoutMinutes: decision.timeoutMinutes,
        },
        severity: decision.action === "ban" ? "warning" : "info",
        subject: { id: userId, kind: "user" },
        summary: [
          `Дело: **#${caseNumber(item.number)}**`,
          `Участник: <@${userId}>`,
          `Сотрудник: <@${moderator.id}>`,
          `Действие: **${actionLabels[decision.action]}**${decision.escalated ? ` · эскалация с «${actionLabels[requestedAction]}»` : ""}`,
          `Баллы: +${points} · активно ${activePoints}`,
          decision.timeoutMinutes
            ? `Срок: ${decision.timeoutMinutes} мин.`
            : undefined,
          `Причина: ${escapeMarkdown(reason)}`,
          evidence ? `Доказательство: ${escapeMarkdown(evidence)}` : undefined,
        ]
          .filter((line): line is string => Boolean(line))
          .join("\n"),
        title: `Дело #${caseNumber(item.number)} создано`,
      });
      await interaction.editReply({
        allowedMentions: { parse: [] },
        components: [
          new ContainerBuilder()
            .setAccentColor(0xf2f2ef)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                [
                  `## Дело #${caseNumber(item.number)} создано`,
                  `Участник: <@${userId}>`,
                  `Применено: **${actionLabels[decision.action]}**`,
                  `Баллы: +${points} · всего ${activePoints}`,
                  decision.escalated
                    ? `Автоматическая эскалация с действия «${actionLabels[requestedAction]}».`
                    : undefined,
                ]
                  .filter((line): line is string => Boolean(line))
                  .join("\n"),
              ),
            ),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.#logger.error(
        { action: requestedAction, error, moderatorId: moderator.id, userId },
        "manual moderation case failed",
      );
      await this.#audit.publish({
        actor: { id: moderator.id, kind: "user" },
        category: "bot",
        discord: true,
        eventType: "moderation.case_failed",
        payload: { error: message, requestedAction },
        severity: "critical",
        subject: { id: userId, kind: "user" },
        summary: `${item ? `Дело #${caseNumber(item.number)} сохранено как отменённое. ` : ""}Не удалось применить «${actionLabels[requestedAction]}» к <@${userId}>. Причина: ${escapeMarkdown(message)}`,
        title: "Ошибка ручной модерации",
      });
      await interaction.editReply(
        "Не удалось применить действие. Ошибка записана в журнал бота.",
      );
    }
  }

  async #revokeCase(
    interaction: Extract<Interaction, { fields: unknown }>,
    number: number,
  ): Promise<void> {
    const item = await this.#repository.findByNumber(this.#guild.id, number);
    if (!item || item.status === "resolved") {
      await interaction.reply({
        content: "Дело уже отменено или не найдено.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (item.status === "appealed") {
      await interaction.reply({
        content: "Дело сейчас рассматривается в тикете обжалования.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const reason = interaction.fields.getTextInputValue("reason").trim();
    await this.#reverseDiscordAction(item, reason);
    const resolved = await this.#repository.resolve({
      guildId: this.#guild.id,
      number,
      reason,
      resolvedById: interaction.user.id,
    });
    if (!resolved) {
      await interaction.reply({
        content: "Дело уже было отменено другим сотрудником.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await this.#audit.publish({
      actor: { id: interaction.user.id, kind: "user" },
      category: "moderation",
      discord: true,
      eventType: "moderation.case_revoked",
      payload: { action: item.appliedAction, reason },
      subject: { id: item.userId, kind: "user" },
      summary: [
        `Дело: **#${caseNumber(item.number)}**`,
        `Участник: <@${item.userId}>`,
        `Отменил: <@${interaction.user.id}>`,
        `Причина: ${escapeMarkdown(reason)}`,
      ].join("\n"),
      title: `Дело #${caseNumber(item.number)} отменено`,
    });
    await interaction.reply({
      content: `Дело #${caseNumber(item.number)} отменено. Его баллы больше не учитываются.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  async #applyDiscordAction(
    target: GuildMember,
    action: ModerationAction,
    reason: string,
    timeoutMinutes: number | null,
  ): Promise<void> {
    const auditReason = `fxvrlxss_ moderation by ${reason}`.slice(0, 500);
    if (action === "warn") return;
    if (action === "timeout") {
      if (!target.moderatable)
        throw new Error("Участнику нельзя выдать тайм-аут");
      await target.timeout((timeoutMinutes ?? 1) * 60_000, auditReason);
      return;
    }
    if (action === "kick") {
      if (!target.kickable) throw new Error("Участника нельзя исключить");
      await target.kick(auditReason);
      return;
    }
    if (!target.bannable) throw new Error("Участника нельзя заблокировать");
    await target.ban({ deleteMessageSeconds: 0, reason: auditReason });
  }

  async #notifyMember(input: {
    readonly action: ModerationNoticeAction;
    readonly caseNumber: number | null;
    readonly channelId?: string;
    readonly points: number;
    readonly summary: string;
    readonly timeoutMinutes?: number | null;
    readonly userId: string;
  }): Promise<void> {
    const content = buildModerationNotice({
      action: input.action,
      appealUrl:
        input.action === "ban"
          ? (this.#appealInviteUrl ?? this.#ticketUrl)
          : this.#ticketUrl,
      caseNumber: input.caseNumber,
      points: input.points,
      serverName: this.#guild.name,
      summary: input.summary,
      ...(input.timeoutMinutes === undefined
        ? {}
        : { timeoutMinutes: input.timeoutMinutes }),
    });
    const user = await this.#guild.client.users.fetch(input.userId);
    const delivered = await user
      .send({ content })
      .then(() => true)
      .catch(() => false);
    if (delivered) return;

    const channel = input.channelId
      ? await this.#guild.channels.fetch(input.channelId).catch(() => null)
      : null;
    if (!channel?.isSendable()) {
      this.#logger.warn(
        { channelId: input.channelId, userId: input.userId },
        "automod member notification could not be delivered",
      );
      return;
    }
    const notice = await channel
      .send({
        allowedMentions: { users: [input.userId] },
        content: [`<@${input.userId}>`, content].join("\n"),
      })
      .catch(() => null);
    if (!notice) return;
    const timer = setTimeout(
      () => void notice.delete().catch(() => undefined),
      60_000,
    );
    timer.unref();
  }

  async #reverseDiscordAction(
    item: ModerationCaseRecord,
    reason: string,
  ): Promise<void> {
    if (item.appliedAction === "ban") {
      const ban = await this.#guild.bans.fetch(item.userId).catch(() => null);
      if (ban) await this.#guild.bans.remove(item.userId, reason);
    }
    if (item.appliedAction === "timeout") {
      const member = await this.#guild.members
        .fetch(item.userId)
        .catch(() => null);
      if (member?.moderatable) await member.timeout(null, reason);
    }
    if (
      item.evidence.source === "automod" &&
      item.evidence.automodAction === "quarantine"
    ) {
      const member = await this.#guild.members
        .fetch(item.userId)
        .catch(() => null);
      if (member?.manageable) {
        await member.roles.remove(this.#quarantineRoleId, reason);
      }
    }
  }

  async #requireStaff(
    interaction: Interaction,
    member: GuildMember,
  ): Promise<boolean> {
    const allowed =
      member.permissions.has(PermissionFlagsBits.Administrator) ||
      member.roles.cache.some((role) =>
        this.#config.staffRoleIds.includes(role.id),
      );
    if (allowed) return true;
    if (interaction.isRepliable()) {
      await interaction.reply({
        content: "У вас нет доступа к ручной модерации.",
        flags: MessageFlags.Ephemeral,
      });
    }
    return false;
  }

  async #validateTarget(
    interaction: Interaction,
    moderator: GuildMember,
    target: GuildMember,
  ): Promise<boolean> {
    const invalid =
      target.user.bot ||
      target.id === moderator.id ||
      target.id === this.#guild.ownerId ||
      target.roles.highest.position >= moderator.roles.highest.position;
    if (!invalid) return true;
    if (interaction.isRepliable()) {
      await interaction.reply({
        content: "Этого участника нельзя выбрать для ручной модерации.",
        flags: MessageFlags.Ephemeral,
      });
    }
    return false;
  }
}
