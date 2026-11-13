import { createServer, type Server } from "node:http";

import { CustomModerationEngine } from "@fxvrlxss/domain/moderation";
import {
  Client,
  Events,
  GatewayIntentBits,
  type AutoModerationActionExecution,
  type Message,
} from "discord.js";
import pino, { type Logger } from "pino";

import type { ResolvedBotConfig } from "./config.js";

export interface BotRuntime {
  start(): Promise<void>;
  stop(): Promise<void>;
}

function createHealthServer(
  port: number,
  isReady: () => boolean,
  logger: Logger,
): Server {
  return createServer((request, response) => {
    if (request.url !== "/health") {
      response.writeHead(404).end();
      return;
    }

    const ready = isReady();
    response.writeHead(ready ? 200 : 503, {
      "content-type": "application/json",
    });
    response.end(JSON.stringify({ ready }));
  }).listen(port, "127.0.0.1", () => {
    logger.info({ port }, "health endpoint listening");
  });
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

export function createBotRuntime(config: ResolvedBotConfig): BotRuntime {
  const logger = pino({ level: config.LOG_LEVEL });
  const moderation = new CustomModerationEngine();
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildModeration,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.AutoModerationConfiguration,
      GatewayIntentBits.AutoModerationExecution,
    ],
  });

  let ready = false;
  let healthServer: Server | undefined;

  client.once(Events.ClientReady, (readyClient) => {
    ready = true;
    logger.info(
      { guildId: config.DISCORD_GUILD_ID, userId: readyClient.user.id },
      "fxvrlxss_ connected",
    );
  });

  client.on(Events.MessageCreate, (message) => {
    if (message.author.bot || message.guildId !== config.DISCORD_GUILD_ID)
      return;

    const inspection = moderation.inspect(toModerationMessage(message));
    if (inspection.findings.length === 0) return;

    logger.info(
      {
        channelId: message.channelId,
        findings: inspection.findings,
        messageId: message.id,
        userId: message.author.id,
      },
      "custom moderation signals observed",
    );
  });

  client.on(
    Events.AutoModerationActionExecution,
    (execution: AutoModerationActionExecution) => {
      if (execution.guild.id !== config.DISCORD_GUILD_ID) return;
      logger.info(
        {
          actionType: execution.action.type,
          channelId: execution.channel?.id,
          ruleId: execution.ruleId,
          userId: execution.userId,
        },
        "discord automod action observed",
      );
    },
  );

  return {
    async start() {
      healthServer = createHealthServer(
        config.HEALTH_PORT,
        () => ready,
        logger,
      );
      await client.login(config.DISCORD_TOKEN);
    },
    async stop() {
      ready = false;
      await client.destroy();
      if (!healthServer) return;
      await new Promise<void>((resolve, reject) => {
        healthServer?.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}
