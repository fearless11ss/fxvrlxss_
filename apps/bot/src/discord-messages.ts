import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  EmbedBuilder,
  MessageFlags,
  TextDisplayBuilder,
  escapeMarkdown,
  type Client,
} from "discord.js";

import type { AuditEvent, AuditWriter } from "./audit.js";
import type { AuditDiscordEntity } from "./audit.js";
import type { GuildResources } from "./guild-resources.js";

const MAX_SUMMARY_LENGTH = 2_800;

function truncate(value: string, limit = MAX_SUMMARY_LENGTH): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}…`;
}

function timestamp(date: Date): string {
  return `<t:${Math.floor(date.getTime() / 1_000)}:F>`;
}

function accentColor(event: AuditEvent): number {
  if (event.severity === "critical") return 0x7f252b;
  if (event.severity === "warning") return 0xb7b7b2;
  return 0xf2f2ef;
}

function discordEntity(entity: AuditDiscordEntity, guildId: string): string {
  switch (entity.kind) {
    case "channel":
      return `<#${entity.id}> · ID: ${entity.id}`;
    case "message":
      return `[сообщение](https://discord.com/channels/${guildId}/${entity.channelId}/${entity.id})`;
    case "role":
      return `<@&${entity.id}>`;
    case "user":
      return `<@${entity.id}>`;
  }
}

export function buildAuditComponents(event: AuditEvent): ContainerBuilder[] {
  const metadata = [
    `Тип: \`${escapeMarkdown(event.eventType)}\``,
    event.actor
      ? `Инициатор: ${discordEntity(event.actor, event.guildId)}`
      : undefined,
    event.subject
      ? `Объект: ${discordEntity(event.subject, event.guildId)}`
      : undefined,
    timestamp(event.occurredAt),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" · ");

  return [
    new ContainerBuilder()
      .setAccentColor(accentColor(event))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## ${escapeMarkdown(event.title)}\n${truncate(escapeMarkdown(event.summary))}`,
        ),
        new TextDisplayBuilder().setContent(`-# ${metadata}`),
      ),
  ];
}

export function buildLifecycleComponents(
  kind: "joined" | "left",
  userId: string,
): ContainerBuilder[] {
  const joined = kind === "joined";
  return [
    new ContainerBuilder()
      .setAccentColor(joined ? 0xf2f2ef : 0x737370)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          joined
            ? `## Новый участник\nДобро пожаловать, <@${userId}>.`
            : `## Участник вышел\n<@${userId}> покинул сервер.`,
        ),
      ),
  ];
}

export function buildWelcomeEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xf2f2ef)
    .setTitle("Новый участник")
    .setDescription("Добро пожаловать на сервер.");
}

export interface StatusSnapshot {
  readonly database: boolean;
  readonly guildId: string;
  readonly ping: number;
  readonly startedAt: Date;
}

export function buildStatusComponents(
  snapshot: StatusSnapshot,
): ContainerBuilder[] {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("core:status:refresh")
      .setLabel("Обновить")
      .setStyle(ButtonStyle.Secondary),
  );

  return [
    new ContainerBuilder()
      .setAccentColor(0xf2f2ef)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            "## Состояние fxvrlxss_",
            `**Discord:** подключён · ${Math.max(0, Math.round(snapshot.ping))} мс`,
            `**PostgreSQL:** ${snapshot.database ? "подключён" : "локально отключён"}`,
            `**Сервер:** \`${snapshot.guildId}\``,
            `**Запущен:** ${timestamp(snapshot.startedAt)}`,
          ].join("\n"),
        ),
      )
      .addActionRowComponents(row),
  ];
}

export class DiscordAuditWriter implements AuditWriter {
  readonly name = "discord";
  readonly #client: Client;
  readonly #resources: GuildResources;

  constructor(client: Client, resources: GuildResources) {
    this.#client = client;
    this.#resources = resources;
  }

  async write(event: AuditEvent): Promise<void> {
    if (!event.discord) return;
    const channelId = this.#resources.channels.logs[event.category];
    const channel = await this.#client.channels.fetch(channelId);
    if (!channel?.isSendable()) {
      throw new Error(`Discord log channel is not sendable: ${channelId}`);
    }
    await channel.send({
      allowedMentions: { parse: [] },
      components: buildAuditComponents(event),
      flags: MessageFlags.IsComponentsV2,
    });
  }
}
