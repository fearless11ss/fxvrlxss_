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
  PermissionFlagsBits,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  escapeMarkdown,
  type Guild,
  type GuildMember,
  type Interaction,
  type VoiceChannel,
  type VoiceState,
} from "discord.js";
import type { Logger } from "pino";

import type { AuditBus } from "./audit.js";
import type { GuildResources } from "./guild-resources.js";
import type { VoiceConfigurationApplier } from "./voice-publication.js";
import type {
  VoiceRoomRecord,
  VoiceRoomRepository,
} from "./voice-room-repository.js";

const LEGACY_PANEL_ID = "voice:panel";
const RENAME_MODAL_ID = "voice:rename:submit";
const LIMIT_MODAL_ID = "voice:limit:submit";

export function buildVoiceRoomControls(
  room: VoiceRoomRecord,
  config: VoiceConfig,
  channelName: string,
): ContainerBuilder[] {
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
        .setCustomId("voice:member:add:open")
        .setLabel("Добавить участника")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("voice:member:remove:open")
        .setLabel("Удалить участника")
        .setStyle(ButtonStyle.Secondary),
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
  return [container];
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

export class VoiceRoomModule implements VoiceConfigurationApplier {
  readonly #audit: AuditBus;
  readonly #guild: Guild;
  readonly #logger: Logger;
  readonly #repository: VoiceRoomRepository;
  readonly #resources: GuildResources;
  #config: VoiceConfig = defaultVoiceConfig;

  constructor(options: {
    readonly audit: AuditBus;
    readonly guild: Guild;
    readonly logger: Logger;
    readonly repository: VoiceRoomRepository;
    readonly resources: GuildResources;
  }) {
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
  }

  async handleChannelDelete(channelId: string): Promise<void> {
    const room = await this.#repository.findByChannel(channelId);
    if (room) await this.#repository.remove(channelId);
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

    if (
      interaction.isButton() &&
      [
        "voice:member:add:open",
        "voice:member:remove:open",
        "voice:owner:open",
      ].includes(customId)
    ) {
      const transfer = customId === "voice:owner:open";
      if (
        (transfer && !this.#config.controls.allowOwnershipTransfer) ||
        (!transfer && !this.#config.controls.allowMemberManagement)
      ) {
        return true;
      }
      const action = transfer
        ? "owner"
        : customId.includes(":add:")
          ? "member:add"
          : "member:remove";
      const select = new UserSelectMenuBuilder()
        .setCustomId(`voice:${action}`)
        .setMaxValues(1)
        .setMinValues(1)
        .setPlaceholder(
          transfer
            ? "Новый владелец из текущей комнаты"
            : action === "member:add"
              ? "Кому разрешить вход"
              : "Кого удалить из комнаты",
        );
      await interaction.reply({
        components: [
          new ContainerBuilder()
            .setAccentColor(0xf2f2ef)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                transfer
                  ? "## Передать комнату\nВыберите участника, который уже находится в вашей комнате."
                  : action === "member:add"
                    ? "## Добавить участника\nВыберите пользователя, которому нужен доступ."
                    : "## Удалить участника\nПользователь будет отключён и не сможет вернуться без нового разрешения.",
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
      const selected = interaction.users.first();
      if (!selected || selected.bot || selected.id === room.ownerId) {
        await interaction.reply({
          content: "Выберите другого обычного участника.",
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }
      const member = await this.#guild.members.fetch(selected.id);
      if (customId === "voice:owner") {
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

      if (!this.#config.controls.allowMemberManagement) return true;
      const adding = customId === "voice:member:add";
      await channel.permissionOverwrites.edit(
        member.id,
        adding
          ? { Connect: true, ViewChannel: true }
          : { Connect: false, ViewChannel: false },
        { reason: `Temporary room owner ${interaction.user.id}` },
      );
      if (!adding && member.voice.channelId === room.channelId) {
        await member.voice.disconnect(
          `Removed by temporary room owner ${interaction.user.id}`,
        );
      }
      await interaction.update({
        components: [
          new ContainerBuilder()
            .setAccentColor(0xf2f2ef)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `## Готово\n<@${member.id}> ${adding ? "получил доступ" : "удалён из комнаты"}.`,
              ),
            ),
        ],
      });
      await this.#logChange(
        room,
        interaction.user.id,
        adding ? "Участник добавлен в комнату" : "Участник удалён из комнаты",
        { memberId: member.id },
      );
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
      created = await this.#repository.create({
        channelId: channel.id,
        controlMessageId: null,
        guildId: this.#guild.id,
        hidden: false,
        locked: false,
        ownerId: member.id,
        userLimit: this.#config.defaultUserLimit,
      });
      created = await this.#ensureRoomControl(created, channel);
      await member.voice.setChannel(
        channel,
        "fxvrlxss_ temporary room created",
      );
      await this.#audit.publish({
        actor: { id: member.id, kind: "user" },
        category: "bot",
        discord: true,
        eventType: "voice.room_created",
        payload: { channelId: channel.id, userLimit: created.userLimit },
        subject: { id: channel.id, kind: "channel" },
        summary: `Для <@${member.id}> создана временная комната <#${channel.id}>.`,
        title: "Временная комната создана",
      });
    } catch (error) {
      if (created) await this.#repository.remove(channel.id);
      await channel
        .delete("Temporary room creation failed")
        .catch(() => undefined);
      throw error;
    }
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
      const channelName = channel.name;
      await channel.delete("fxvrlxss_ empty temporary room");
      await this.#repository.remove(channelId);
      await this.#audit.publish({
        category: "bot",
        discord: true,
        eventType: "voice.room_deleted",
        payload: { channelId, channelName },
        summary: `Пустая временная комната \`${escapeMarkdown(channelName)}\` удалена.`,
        title: "Временная комната удалена",
      });
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
      category: "bot",
      discord: true,
      eventType: "voice.owner_transferred_automatically",
      payload: { channelId, ownerId: nextOwner.id },
      subject: { id: channelId, kind: "channel" },
      summary: `Владение <#${channelId}> автоматически передано <@${nextOwner.id}> после выхода прежнего владельца.`,
      title: "Владелец комнаты изменён",
    });
  }

  async #applyAccess(
    room: VoiceRoomRecord,
    channel: VoiceChannel,
  ): Promise<void> {
    const base = {
      Connect: room.locked ? false : null,
      ViewChannel: room.hidden ? false : null,
    };
    await Promise.all([
      channel.permissionOverwrites.edit(this.#guild.roles.everyone.id, base),
      channel.permissionOverwrites.edit(this.#resources.roles.member, base),
    ]);
    await channel.permissionOverwrites.edit(room.ownerId, {
      Connect: true,
      ViewChannel: true,
    });
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
      allowedMentions: { parse: [] },
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
          await channel.delete("fxvrlxss_ stale empty temporary room");
          await this.#repository.remove(room.channelId);
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

  async #logChange(
    room: VoiceRoomRecord,
    actorId: string,
    title: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.#audit.publish({
      actor: { id: actorId, kind: "user" },
      category: "bot",
      discord: true,
      eventType: "voice.room_updated",
      payload: { channelId: room.channelId, ...payload },
      subject: { id: room.channelId, kind: "channel" },
      summary: `${title} в <#${room.channelId}>.`,
      title,
    });
  }
}
