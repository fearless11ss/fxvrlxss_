import {
  defaultVoiceConfig,
  voiceConfigSchema,
  type VoiceConfig,
} from "@fxvrlxss/domain/voice-config";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  LabelBuilder,
  MessageFlags,
  MessageType,
  ModalBuilder,
  OverwriteType,
  PermissionFlagsBits,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  escapeMarkdown,
  type Guild,
  type GuildMember,
  type Interaction,
  type PermissionOverwriteOptions,
  type VoiceChannel,
  type VoiceState,
} from "discord.js";
import type { Logger } from "pino";

import type { AuditBus } from "./audit.js";
import type { GuildResources } from "./guild-resources.js";
import type { VoiceConfigurationApplier } from "./voice-publication.js";
import type {
  VoiceAccessEntry,
  VoiceAccessKind,
  VoiceAccessRepository,
} from "./voice-access-repository.js";
import type {
  VoiceRoomRecord,
  VoiceRoomRepository,
} from "./voice-room-repository.js";
import {
  describeVoiceRoomLifecycle,
  type VoiceRoomSnapshot,
} from "./voice-room-log.js";

const LEGACY_PANEL_ID = "voice:panel";
const MAX_ACCESS_PROFILE_ENTRIES = 90;
const RENAME_MODAL_ID = "voice:rename:submit";
const LIMIT_MODAL_ID = "voice:limit:submit";

export function buildVoiceRoomControls(
  room: VoiceRoomRecord,
  config: VoiceConfig,
  channelName: string,
): Array<TextDisplayBuilder | ContainerBuilder> {
  const primary = new ActionRowBuilder<ButtonBuilder>();
  if (config.controls.allowRename) {
    primary.addComponents(
      new ButtonBuilder()
        .setCustomId("voice:rename:open")
        .setLabel("Переименовать")
        .setStyle(ButtonStyle.Secondary),
    );
  }
  if (config.controls.allowUserLimit) {
    primary.addComponents(
      new ButtonBuilder()
        .setCustomId("voice:limit:open")
        .setLabel("Изменить лимит")
        .setStyle(ButtonStyle.Secondary),
    );
  }
  if (config.controls.allowLock) {
    primary.addComponents(
      new ButtonBuilder()
        .setCustomId("voice:lock")
        .setLabel(room.locked ? "Открыть вход" : "Закрыть вход")
        .setStyle(room.locked ? ButtonStyle.Success : ButtonStyle.Secondary),
    );
  }
  if (config.controls.allowHide) {
    primary.addComponents(
      new ButtonBuilder()
        .setCustomId("voice:hide")
        .setLabel(room.hidden ? "Показать" : "Скрыть")
        .setStyle(room.hidden ? ButtonStyle.Success : ButtonStyle.Secondary),
    );
  }

  const members = new ActionRowBuilder<ButtonBuilder>();
  if (config.controls.allowMemberManagement) {
    members.addComponents(
      new ButtonBuilder()
        .setCustomId("voice:access:trusted:open")
        .setLabel("Доверенные")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("voice:access:banned:open")
        .setLabel("Забаненные")
        .setStyle(ButtonStyle.Danger),
    );
  }
  if (config.controls.allowOwnershipTransfer) {
    members.addComponents(
      new ButtonBuilder()
        .setCustomId("voice:owner:open")
        .setLabel("Передать владельца")
        .setStyle(ButtonStyle.Secondary),
    );
  }

  const state = [
    room.locked ? "вход закрыт" : "вход открыт",
    room.hidden ? "скрыта" : "видна",
    room.userLimit === 0 ? "без лимита" : `лимит ${room.userLimit}`,
  ].join(" · ");
  const container = new ContainerBuilder()
    .setAccentColor(0xf2f2ef)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `## ${escapeMarkdown(config.panelTitle)}`,
          `**${escapeMarkdown(channelName)}** · <#${room.channelId}>`,
          `Владелец: <@${room.ownerId}>`,
          escapeMarkdown(config.panelDescription),
          `Состояние: ${state}`,
        ].join("\n"),
      ),
    );
  if (primary.components.length > 0) container.addActionRowComponents(primary);
  if (members.components.length > 0) container.addActionRowComponents(members);
  return [new TextDisplayBuilder().setContent(`<@${room.ownerId}>`), container];
}

function accessKindLabel(kind: VoiceAccessKind): string {
  return kind === "trusted" ? "Доверенные" : "Забаненные";
}

export function buildVoiceAccessManager(
  kind: VoiceAccessKind,
  entries: readonly VoiceAccessEntry[],
): ContainerBuilder[] {
  const matching = entries.filter((entry) => entry.kind === kind);
  const visible = matching.slice(0, 25).map((entry) => `<@${entry.subjectId}>`);
  const list =
    visible.length === 0
      ? "Список пуст."
      : [
          visible.join(" · "),
          matching.length > visible.length
            ? `И ещё: ${matching.length - visible.length}.`
            : undefined,
        ]
          .filter((line): line is string => Boolean(line))
          .join("\n");
  const explanation =
    kind === "trusted"
      ? "Эти пользователи могут входить в закрытые и скрытые комнаты владельца. Список действует для всех его будущих комнат."
      : "Эти пользователи не могут входить ни в одну текущую или будущую комнату владельца.";
  return [
    new ContainerBuilder()
      .setAccentColor(kind === "trusted" ? 0xf2f2ef : 0x9f1d2d)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [`## ${accessKindLabel(kind)}`, explanation, list].join("\n\n"),
        ),
      )
      .addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`voice:access:${kind}:add:open`)
            .setLabel("Добавить")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`voice:access:${kind}:remove:open`)
            .setDisabled(matching.length === 0)
            .setLabel("Убрать")
            .setStyle(ButtonStyle.Secondary),
        ),
      ),
  ];
}

export interface VoiceMemberOverwritePlan {
  readonly id: string;
  readonly kind: "owner" | VoiceAccessKind;
  readonly permissions: PermissionOverwriteOptions;
  readonly reason: string;
  readonly type: OverwriteType.Member;
}

export function buildVoiceMemberOverwritePlan(
  ownerId: string,
  entries: readonly VoiceAccessEntry[],
): readonly VoiceMemberOverwritePlan[] {
  return [
    {
      id: ownerId,
      kind: "owner",
      permissions: { Connect: true, ViewChannel: true },
      reason: `Temporary room owner ${ownerId}`,
      type: OverwriteType.Member,
    },
    ...entries.map((entry): VoiceMemberOverwritePlan => ({
      id: entry.subjectId,
      kind: entry.kind,
      permissions:
        entry.kind === "trusted"
          ? { Connect: true, ViewChannel: true }
          : { Connect: false, ViewChannel: false },
      reason:
        entry.kind === "trusted"
          ? `Trusted by temporary room owner ${ownerId}`
          : `Banned by temporary room owner ${ownerId}`,
      type: OverwriteType.Member,
    })),
  ];
}

function renameModal(channelName: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(RENAME_MODAL_ID)
    .setTitle("Переименовать комнату")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Новое название")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("name")
            .setMaxLength(100)
            .setMinLength(1)
            .setRequired(true)
            .setStyle(TextInputStyle.Short)
            .setValue(channelName),
        ),
    );
}

function limitModal(userLimit: number): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(LIMIT_MODAL_ID)
    .setTitle("Изменить лимит")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Количество участников")
        .setDescription("Введите число от 0 до 99. 0 снимает ограничение.")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("limit")
            .setMaxLength(2)
            .setMinLength(1)
            .setRequired(true)
            .setStyle(TextInputStyle.Short)
            .setValue(String(userLimit)),
        ),
    );
}

export async function runVoiceRoomCreationSteps<Room>(steps: {
  readonly applyAccess: () => Promise<void>;
  readonly moveOwner: () => Promise<void>;
  readonly publishLifecycle: (room: Room) => Promise<void>;
  readonly sendControl: () => Promise<Room>;
}): Promise<Room> {
  await steps.applyAccess();
  await steps.moveOwner();
  const room = await steps.sendControl();
  await steps.publishLifecycle(room);
  return room;
}

export class VoiceRoomModule implements VoiceConfigurationApplier {
  readonly #accessRepository: VoiceAccessRepository;
  readonly #audit: AuditBus;
  readonly #guild: Guild;
  readonly #logger: Logger;
  readonly #repository: VoiceRoomRepository;
  readonly #resources: GuildResources;
  readonly #reportedDeletions = new Set<string>();
  #config: VoiceConfig = defaultVoiceConfig;

  constructor(options: {
    readonly accessRepository: VoiceAccessRepository;
    readonly audit: AuditBus;
    readonly guild: Guild;
    readonly logger: Logger;
    readonly repository: VoiceRoomRepository;
    readonly resources: GuildResources;
  }) {
    this.#accessRepository = options.accessRepository;
    this.#audit = options.audit;
    this.#guild = options.guild;
    this.#logger = options.logger;
    this.#repository = options.repository;
    this.#resources = options.resources;
  }

  async start(): Promise<void> {
    await this.#removeLegacyPanel();
    await this.#reconcileRooms();
  }

  async apply(config: VoiceConfig): Promise<void> {
    this.#config = voiceConfigSchema.parse(config);
    await this.#reconcileRooms();
  }

  stop(): Promise<void> {
    return Promise.resolve();
  }

  async handleVoiceState(before: VoiceState, after: VoiceState): Promise<void> {
    if (before.channelId === after.channelId || after.member?.user.bot) return;
    if (after.channelId === this.#resources.channels.voice.createRoom) {
      const member =
        after.member ?? (await this.#guild.members.fetch(after.id));
      if (this.#config.enabled) await this.#enterCreator(member);
      else {
        await member.voice.setChannel(
          before.channelId,
          "fxvrlxss_ temporary voice rooms are disabled",
        );
      }
    }
    if (before.channelId) {
      await this.#cleanupDepartedRoom(before.channelId, after.id);
    }
    if (after.channelId) await this.#enforceJoinedRoom(after);
  }

  async handleChannelDelete(
    channel: Pick<VoiceChannel, "createdAt" | "id" | "name">,
  ): Promise<boolean> {
    if (this.#reportedDeletions.delete(channel.id)) {
      await this.#repository.remove(channel.id);
      return true;
    }
    const room = await this.#repository.findByChannel(channel.id);
    if (!room) return false;
    const snapshot = await this.#roomSnapshot(room, channel, new Date());
    await this.#publishRoomDeleted(snapshot, "manual_or_external");
    await this.#repository.remove(channel.id);
    return true;
  }

  async handleMessageDelete(
    channelId: string,
    messageId: string,
  ): Promise<void> {
    const room = await this.#repository.findByChannel(channelId);
    if (!room || room.controlMessageId !== messageId) return;
    const channel = this.#guild.channels.cache.get(channelId);
    if (!channel || channel.type !== ChannelType.GuildVoice) return;
    await this.#ensureRoomControl(room, channel);
  }

  async handleInteraction(interaction: Interaction): Promise<boolean> {
    if (interaction.guildId !== this.#guild.id) return false;
    const customId =
      interaction.isMessageComponent() || interaction.isModalSubmit()
        ? interaction.customId
        : "";
    if (!customId.startsWith("voice:")) return false;

    const room = interaction.channelId
      ? await this.#repository.findByChannel(interaction.channelId)
      : null;
    if (!room || room.ownerId !== interaction.user.id) {
      if (interaction.isRepliable()) {
        await interaction.reply({
          content: "Управлять этой комнатой может только её текущий владелец.",
          flags: MessageFlags.Ephemeral,
        });
      }
      return true;
    }
    const channel = this.#guild.channels.cache.get(room.channelId);
    if (!channel || channel.type !== ChannelType.GuildVoice) {
      await this.#repository.remove(room.channelId);
      if (interaction.isRepliable()) {
        await interaction.reply({
          content: "Комната больше не существует.",
          flags: MessageFlags.Ephemeral,
        });
      }
      return true;
    }

    if (interaction.isButton() && customId === "voice:rename:open") {
      if (!this.#config.controls.allowRename) return true;
      await interaction.showModal(renameModal(channel.name));
      return true;
    }
    if (interaction.isModalSubmit() && customId === RENAME_MODAL_ID) {
      if (!this.#config.controls.allowRename) return true;
      const name = interaction.fields.getTextInputValue("name").trim();
      await channel.setName(
        name,
        `Temporary room owner ${interaction.user.id}`,
      );
      await this.#updateInteraction(interaction, room, channel);
      await this.#logChange(
        room,
        interaction.user.id,
        "Комната переименована",
        {
          name,
        },
      );
      return true;
    }

    if (interaction.isButton() && customId === "voice:limit:open") {
      if (!this.#config.controls.allowUserLimit) return true;
      await interaction.showModal(limitModal(room.userLimit));
      return true;
    }
    if (interaction.isModalSubmit() && customId === LIMIT_MODAL_ID) {
      if (!this.#config.controls.allowUserLimit) return true;
      const value = Number(interaction.fields.getTextInputValue("limit"));
      if (!Number.isInteger(value) || value < 0 || value > 99) {
        await interaction.reply({
          content: "Введите целое число от 0 до 99.",
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }
      await channel.setUserLimit(
        value,
        `Temporary room owner ${interaction.user.id}`,
      );
      const updated = await this.#repository.update(room.channelId, {
        userLimit: value,
      });
      if (!updated) throw new Error("Temporary voice room disappeared");
      await this.#updateInteraction(interaction, updated, channel);
      await this.#logChange(
        updated,
        interaction.user.id,
        "Лимит комнаты изменён",
        { userLimit: value },
      );
      return true;
    }

    if (
      interaction.isButton() &&
      (customId === "voice:lock" || customId === "voice:hide")
    ) {
      const locking = customId === "voice:lock";
      if (
        (locking && !this.#config.controls.allowLock) ||
        (!locking && !this.#config.controls.allowHide)
      ) {
        return true;
      }
      const updated = await this.#repository.update(room.channelId, {
        ...(locking ? { locked: !room.locked } : { hidden: !room.hidden }),
      });
      if (!updated) throw new Error("Temporary voice room disappeared");
      await this.#applyAccess(updated, channel);
      await this.#updateInteraction(interaction, updated, channel);
      await this.#logChange(
        updated,
        interaction.user.id,
        locking ? "Доступ в комнату изменён" : "Видимость комнаты изменена",
        { hidden: updated.hidden, locked: updated.locked },
      );
      return true;
    }

    if (interaction.isButton() && customId === "voice:owner:open") {
      if (!this.#config.controls.allowOwnershipTransfer) return true;
      const select = new UserSelectMenuBuilder()
        .setCustomId("voice:owner")
        .setMaxValues(1)
        .setMinValues(1)
        .setPlaceholder("Новый владелец из текущей комнаты");
      await interaction.reply({
        components: [
          new ContainerBuilder()
            .setAccentColor(0xf2f2ef)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                "## Передать комнату\nВыберите участника, который уже находится в вашей комнате.",
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

    const accessListMatch = /^voice:access:(trusted|banned):open$/.exec(
      customId,
    );
    if (interaction.isButton() && accessListMatch) {
      if (!this.#config.controls.allowMemberManagement) return true;
      const kind = accessListMatch[1] as VoiceAccessKind;
      const entries = await this.#accessRepository.list(
        this.#guild.id,
        room.ownerId,
      );
      await interaction.reply({
        allowedMentions: { parse: [] },
        components: buildVoiceAccessManager(kind, entries),
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      });
      return true;
    }

    const accessPickerMatch =
      /^voice:access:(trusted|banned):(add|remove):open$/.exec(customId);
    if (interaction.isButton() && accessPickerMatch) {
      if (!this.#config.controls.allowMemberManagement) return true;
      const kind = accessPickerMatch[1] as VoiceAccessKind;
      const action = accessPickerMatch[2] as "add" | "remove";
      const select = new UserSelectMenuBuilder()
        .setCustomId(`voice:access:${kind}:${action}`)
        .setMaxValues(1)
        .setMinValues(1)
        .setPlaceholder(
          action === "add"
            ? `Кого добавить: ${accessKindLabel(kind).toLowerCase()}`
            : `Кого убрать: ${accessKindLabel(kind).toLowerCase()}`,
        );
      await interaction.update({
        components: [
          new ContainerBuilder()
            .setAccentColor(kind === "trusted" ? 0xf2f2ef : 0x9f1d2d)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `## ${action === "add" ? "Добавить" : "Убрать"}\nВыберите пользователя для списка «${accessKindLabel(kind)}».`,
              ),
            )
            .addActionRowComponents(
              new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
                select,
              ),
            ),
        ],
      });
      return true;
    }

    if (interaction.isUserSelectMenu() && customId === "voice:owner") {
      const selected = interaction.users.first();
      if (!selected || selected.bot || selected.id === room.ownerId) {
        await interaction.reply({
          content: "Выберите другого обычного участника.",
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }
      const member = await this.#guild.members.fetch(selected.id);
      if (!this.#config.controls.allowOwnershipTransfer) return true;
      if (member.voice.channelId !== room.channelId) {
        await interaction.reply({
          content: "Передать комнату можно только участнику внутри неё.",
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }
      const existing = await this.#repository.findByOwner(
        this.#guild.id,
        member.id,
      );
      if (existing) {
        await interaction.reply({
          content: "У выбранного участника уже есть временная комната.",
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }
      const updated = await this.#repository.update(room.channelId, {
        ownerId: member.id,
      });
      if (!updated) throw new Error("Temporary voice room disappeared");
      await this.#applyAccess(updated, channel);
      await this.#ensureRoomControl(updated, channel);
      await interaction.update({
        components: [
          new ContainerBuilder()
            .setAccentColor(0xf2f2ef)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `## Комната передана\nНовый владелец: <@${member.id}>.`,
              ),
            ),
        ],
      });
      await this.#logChange(
        updated,
        interaction.user.id,
        "Владелец комнаты изменён",
        { ownerId: member.id, previousOwnerId: room.ownerId },
      );
      return true;
    }

    const accessChangeMatch =
      /^voice:access:(trusted|banned):(add|remove)$/.exec(customId);
    if (interaction.isUserSelectMenu() && accessChangeMatch) {
      if (!this.#config.controls.allowMemberManagement) return true;
      const selected = interaction.users.first();
      if (!selected || selected.bot || selected.id === room.ownerId) {
        await interaction.reply({
          content: "Выберите другого обычного участника.",
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }
      const kind = accessChangeMatch[1] as VoiceAccessKind;
      const action = accessChangeMatch[2] as "add" | "remove";
      const entries = await this.#accessRepository.list(
        this.#guild.id,
        room.ownerId,
      );
      const current = entries.find((entry) => entry.subjectId === selected.id);
      if (
        action === "add" &&
        !current &&
        entries.length >= MAX_ACCESS_PROFILE_ENTRIES
      ) {
        await interaction.reply({
          content: `В доверенных и забаненных уже суммарно ${MAX_ACCESS_PROFILE_ENTRIES} пользователей — это безопасный предел Discord для одной комнаты.`,
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }
      if (action === "remove" && current?.kind !== kind) {
        await interaction.reply({
          content: `<@${selected.id}> не находится в списке «${accessKindLabel(kind)}».`,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        });
        return true;
      }
      await this.#accessRepository.set(
        this.#guild.id,
        room.ownerId,
        selected.id,
        action === "add" ? kind : null,
      );
      await this.#applyAccess(room, channel);
      const updatedEntries = await this.#accessRepository.list(
        this.#guild.id,
        room.ownerId,
      );
      await interaction.update({
        allowedMentions: { parse: [] },
        components: buildVoiceAccessManager(kind, updatedEntries),
      });
      await this.#logAccessChange(room.ownerId, selected.id, kind, action);
      return true;
    }

    return true;
  }

  async #ownedRoom(
    ownerId: string,
  ): Promise<{ channel: VoiceChannel; room: VoiceRoomRecord } | null> {
    const room = await this.#repository.findByOwner(this.#guild.id, ownerId);
    if (!room) return null;
    const channel = this.#guild.channels.cache.get(room.channelId);
    if (!channel || channel.type !== ChannelType.GuildVoice) {
      await this.#repository.remove(room.channelId);
      return null;
    }
    return { channel, room };
  }

  async #enterCreator(member: GuildMember): Promise<void> {
    const existing = await this.#ownedRoom(member.id);
    if (existing) {
      await member.voice.setChannel(
        existing.channel,
        "Returning owner to existing temporary room",
      );
      return;
    }
    const name = this.#roomName(member.displayName);
    const channel = await this.#guild.channels.create({
      name,
      parent: this.#resources.channels.voice.category,
      permissionOverwrites: [
        {
          allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel],
          id: member.id,
        },
      ],
      reason: `fxvrlxss_ temporary room for ${member.id}`,
      type: ChannelType.GuildVoice,
      userLimit: this.#config.defaultUserLimit,
    });
    let created: VoiceRoomRecord | undefined;
    try {
      const persisted = await this.#repository.create({
        channelId: channel.id,
        controlMessageId: null,
        guildId: this.#guild.id,
        hidden: false,
        locked: false,
        ownerId: member.id,
        userLimit: this.#config.defaultUserLimit,
      });
      created = persisted;
      created = await runVoiceRoomCreationSteps({
        applyAccess: () => this.#applyAccess(persisted, channel),
        moveOwner: async () => {
          await member.voice.setChannel(
            channel,
            "fxvrlxss_ temporary room created",
          );
        },
        publishLifecycle: async (room) => {
          const snapshot = await this.#roomSnapshot(room, channel);
          await this.#audit.publish({
            actor: { id: member.id, kind: "user" },
            category: "server",
            discord: true,
            eventType: "voice.room_created",
            payload: { room: snapshot },
            subject: {
              id: channel.id,
              kind: "channel",
              label: channel.name,
            },
            summary: describeVoiceRoomLifecycle("created", snapshot),
            title: "Временная комната создана",
          });
        },
        sendControl: () => this.#ensureRoomControl(persisted, channel, true),
      });
    } catch (error) {
      if (created) await this.#repository.remove(channel.id);
      await channel
        .delete("Temporary room creation failed")
        .catch(() => undefined);
      throw error;
    }
  }

  async #enforceJoinedRoom(state: VoiceState): Promise<void> {
    if (!state.channelId || state.id === this.#guild.client.user.id) return;
    const room = await this.#repository.findByChannel(state.channelId);
    if (!room || state.id === room.ownerId) return;
    const entries = await this.#accessRepository.list(
      this.#guild.id,
      room.ownerId,
    );
    if (
      !entries.some(
        (entry) => entry.kind === "banned" && entry.subjectId === state.id,
      )
    ) {
      return;
    }
    const member = state.member ?? (await this.#guild.members.fetch(state.id));
    await member.voice.disconnect(
      `Banned from temporary rooms owned by ${room.ownerId}`,
    );
    await this.#audit.publish({
      actor: { id: state.id, kind: "user" },
      category: "server",
      discord: true,
      eventType: "voice.access_blocked",
      payload: { channelId: room.channelId, ownerId: room.ownerId },
      subject: { id: state.id, kind: "user" },
      summary: `<@${state.id}> отключён от <#${room.channelId}> · ID: ${room.channelId}. Пользователь находится в списке забаненных владельца <@${room.ownerId}>.`,
      title: "Вход во временную комнату заблокирован",
    });
  }

  async #cleanupDepartedRoom(
    channelId: string,
    departedUserId: string,
  ): Promise<void> {
    const room = await this.#repository.findByChannel(channelId);
    if (!room) return;
    const channel = this.#guild.channels.cache.get(channelId);
    if (!channel || channel.type !== ChannelType.GuildVoice) {
      await this.#repository.remove(channelId);
      return;
    }
    const people = channel.members.filter((member) => !member.user.bot);
    if (people.size === 0) {
      await this.#deleteManagedRoom(
        room,
        channel,
        "empty",
        "fxvrlxss_ empty temporary room",
      );
      return;
    }
    if (room.ownerId !== departedUserId) return;
    let nextOwner: GuildMember | undefined;
    for (const candidate of people.values()) {
      const ownsAnother = await this.#repository.findByOwner(
        this.#guild.id,
        candidate.id,
      );
      if (!ownsAnother) {
        nextOwner = candidate;
        break;
      }
    }
    if (!nextOwner) return;
    const updated = await this.#repository.update(channelId, {
      ownerId: nextOwner.id,
    });
    if (!updated) return;
    await this.#applyAccess(updated, channel);
    await this.#ensureRoomControl(updated, channel);
    await this.#audit.publish({
      actor: { id: departedUserId, kind: "user" },
      category: "server",
      discord: true,
      eventType: "voice.owner_transferred_automatically",
      payload: { channelId, ownerId: nextOwner.id },
      subject: { id: channelId, kind: "channel", label: channel.name },
      summary: `Канал: <#${channelId}> · ID: ${channelId}. Владение автоматически передано <@${nextOwner.id}> после выхода прежнего владельца.`,
      title: "Владелец комнаты изменён",
    });
  }

  async #roomSnapshot(
    room: VoiceRoomRecord,
    channel: Pick<VoiceChannel, "createdAt" | "id" | "name">,
    deletedAt?: Date,
  ): Promise<VoiceRoomSnapshot> {
    const entries = await this.#accessRepository.list(
      this.#guild.id,
      room.ownerId,
    );
    return {
      bannedIds: entries
        .filter((entry) => entry.kind === "banned")
        .map((entry) => entry.subjectId),
      channelId: channel.id,
      createdAt: channel.createdAt.toISOString(),
      ...(deletedAt ? { deletedAt: deletedAt.toISOString() } : {}),
      hidden: room.hidden,
      locked: room.locked,
      name: channel.name,
      ownerId: room.ownerId,
      trustedIds: entries
        .filter((entry) => entry.kind === "trusted")
        .map((entry) => entry.subjectId),
      userLimit: room.userLimit,
    };
  }

  async #deleteManagedRoom(
    room: VoiceRoomRecord,
    channel: VoiceChannel,
    reason: "empty" | "startup_reconciliation",
    discordReason: string,
  ): Promise<void> {
    const snapshot = await this.#roomSnapshot(room, channel);
    this.#reportedDeletions.add(channel.id);
    try {
      await channel.delete(discordReason);
    } catch (error) {
      this.#reportedDeletions.delete(channel.id);
      throw error;
    }
    const deletedSnapshot: VoiceRoomSnapshot = {
      ...snapshot,
      deletedAt: new Date().toISOString(),
    };
    await this.#publishRoomDeleted(deletedSnapshot, reason);
    await this.#repository.remove(channel.id);
  }

  async #publishRoomDeleted(
    snapshot: VoiceRoomSnapshot,
    reason: "empty" | "manual_or_external" | "startup_reconciliation",
  ): Promise<void> {
    await this.#audit.publish({
      category: "server",
      discord: true,
      eventType: "voice.room_deleted",
      payload: { reason, room: snapshot },
      subject: {
        id: snapshot.channelId,
        kind: "channel",
        label: snapshot.name,
      },
      summary: describeVoiceRoomLifecycle("deleted", snapshot),
      title: "Временная комната удалена",
    });
  }

  async #applyAccess(
    room: VoiceRoomRecord,
    channel: VoiceChannel,
  ): Promise<void> {
    const entries = await this.#accessRepository.list(
      this.#guild.id,
      room.ownerId,
    );
    const bannedIds = entries
      .filter((entry) => entry.kind === "banned")
      .map((entry) => entry.subjectId);
    const memberOverwrites = buildVoiceMemberOverwritePlan(
      room.ownerId,
      entries,
    );
    const managedMemberIds = new Set(
      memberOverwrites.map((overwrite) => overwrite.id),
    );
    await Promise.all(
      channel.permissionOverwrites.cache
        .filter(
          (overwrite) =>
            overwrite.type === OverwriteType.Member &&
            !managedMemberIds.has(overwrite.id),
        )
        .map((overwrite) =>
          overwrite.delete("Refreshing persistent voice access profile"),
        ),
    );
    const base = {
      Connect: room.locked ? false : null,
      ViewChannel: room.hidden ? false : null,
    };
    await Promise.all([
      channel.permissionOverwrites.edit(this.#guild.roles.everyone.id, base),
      channel.permissionOverwrites.edit(this.#resources.roles.member, base),
    ]);
    await Promise.all(
      memberOverwrites.map((overwrite) =>
        channel.permissionOverwrites.edit(overwrite.id, overwrite.permissions, {
          reason: overwrite.reason,
          type: overwrite.type,
        }),
      ),
    );
    await Promise.all(
      bannedIds
        .map((subjectId) => channel.members.get(subjectId))
        .filter((member): member is GuildMember => Boolean(member))
        .map((member) =>
          member.voice.disconnect(
            `Banned from temporary rooms owned by ${room.ownerId}`,
          ),
        ),
    );
  }

  async #removeLegacyPanel(): Promise<void> {
    const general = this.#guild.channels.cache.find(
      (channel) =>
        channel.type === ChannelType.GuildCategory &&
        channel.name === "ОБЩЕНИЕ",
    );
    const channel = this.#guild.channels.cache.find(
      (candidate) =>
        candidate.type === ChannelType.GuildText &&
        candidate.name === "команды-бота" &&
        candidate.parentId === general?.id,
    );
    if (!channel || channel.type !== ChannelType.GuildText) return;
    const [recent, pins] = await Promise.all([
      channel.messages.fetch({ limit: 100 }),
      channel.messages.fetchPins({ limit: 50 }),
    ]);
    const messages = new Map(
      [...recent.values(), ...pins.items.map(({ message }) => message)].map(
        (message) => [message.id, message],
      ),
    );
    const panelIds = new Set(
      [...messages.values()]
        .filter(
          (message) =>
            message.author.id === this.#guild.client.user.id &&
            JSON.stringify(
              message.components.map((item) => item.toJSON()),
            ).includes(LEGACY_PANEL_ID),
        )
        .map((message) => message.id),
    );
    for (const message of messages.values()) {
      if (
        panelIds.has(message.id) ||
        (message.type === MessageType.ChannelPinnedMessage &&
          message.reference?.messageId &&
          panelIds.has(message.reference.messageId))
      ) {
        await message.delete().catch(() => undefined);
      }
    }
  }

  async #ensureRoomControl(
    room: VoiceRoomRecord,
    channel: VoiceChannel,
    notifyOwner = false,
  ): Promise<VoiceRoomRecord> {
    const existing = room.controlMessageId
      ? await channel.messages.fetch(room.controlMessageId).catch(() => null)
      : null;
    if (existing) {
      await existing.edit({
        allowedMentions: { parse: [] },
        components: buildVoiceRoomControls(room, this.#config, channel.name),
        flags: MessageFlags.IsComponentsV2,
      });
      return room;
    }
    const control = await channel.send({
      allowedMentions: notifyOwner
        ? { parse: [], users: [room.ownerId] }
        : { parse: [] },
      components: buildVoiceRoomControls(room, this.#config, channel.name),
      flags: MessageFlags.IsComponentsV2,
    });
    const updated = await this.#repository.update(room.channelId, {
      controlMessageId: control.id,
    });
    if (!updated) throw new Error("Temporary voice room disappeared");
    return updated;
  }

  async #reconcileRooms(): Promise<void> {
    const rooms = await this.#repository.listGuild(this.#guild.id);
    for (const room of rooms) {
      try {
        const channel = this.#guild.channels.cache.get(room.channelId);
        if (
          !channel ||
          channel.type !== ChannelType.GuildVoice ||
          channel.parentId !== this.#resources.channels.voice.category
        ) {
          await this.#repository.remove(room.channelId);
          continue;
        }
        if (channel.members.filter((member) => !member.user.bot).size === 0) {
          await this.#deleteManagedRoom(
            room,
            channel,
            "startup_reconciliation",
            "fxvrlxss_ stale empty temporary room",
          );
          continue;
        }
        await channel.setUserLimit(room.userLimit);
        await this.#applyAccess(room, channel);
        await this.#ensureRoomControl(room, channel);
      } catch (error) {
        this.#logger.error(
          { channelId: room.channelId, error },
          "temporary voice room reconciliation failed",
        );
      }
    }
  }

  #roomName(displayName: string): string {
    return this.#config.roomNameTemplate
      .replaceAll("{name}", displayName)
      .replaceAll(/\s+/g, " ")
      .trim()
      .slice(0, 100);
  }

  async #updateInteraction(
    interaction: Interaction,
    room: VoiceRoomRecord,
    channel: VoiceChannel,
  ): Promise<void> {
    const response = {
      allowedMentions: { parse: [] as never[] },
      components: buildVoiceRoomControls(room, this.#config, channel.name),
    };
    if (interaction.isModalSubmit()) {
      if (interaction.isFromMessage()) await interaction.update(response);
      else {
        await interaction.reply({
          ...response,
          flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        });
      }
      return;
    }
    if (interaction.isButton() || interaction.isUserSelectMenu()) {
      await interaction.update({
        ...response,
      });
    }
  }

  async #logAccessChange(
    ownerId: string,
    subjectId: string,
    kind: VoiceAccessKind,
    action: "add" | "remove",
  ): Promise<void> {
    const added = action === "add";
    const list = accessKindLabel(kind).toLowerCase();
    await this.#audit.publish({
      actor: { id: ownerId, kind: "user" },
      category: "server",
      discord: true,
      eventType: `voice.access_${kind}_${added ? "added" : "removed"}`,
      payload: { action, kind, ownerId, subjectId },
      subject: { id: subjectId, kind: "user" },
      summary: `<@${subjectId}> ${added ? "добавлен" : "убран"} ${added ? "в" : "из"} список «${list}» владельца <@${ownerId}>. Настройка действует для всех его временных комнат.`,
      title: added
        ? `Пользователь добавлен: ${accessKindLabel(kind)}`
        : `Пользователь убран: ${accessKindLabel(kind)}`,
    });
  }

  async #logChange(
    room: VoiceRoomRecord,
    actorId: string,
    title: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.#audit.publish({
      actor: { id: actorId, kind: "user" },
      category: "server",
      discord: true,
      eventType: "voice.room_updated",
      payload: { channelId: room.channelId, ...payload },
      subject: { id: room.channelId, kind: "channel" },
      summary: `Канал: <#${room.channelId}> · ID: ${room.channelId}.`,
      title,
    });
  }
}
