import { createServer, type Server } from "node:http";

import { createDatabase } from "@fxvrlxss/database/client";
import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import pino, { type Logger } from "pino";

import {
  prepareAppealGuild,
  startAppealGuildCore,
  type AppealGuildCore,
} from "./appeal-guild-core.js";
import type { ResolvedBotConfig } from "./config.js";
import { DatabaseAutomodPublicationRepository } from "./database-automod-publication.js";
import { DatabaseAuditWriter } from "./database-audit.js";
import { DatabaseGuildResourceCatalogWriter } from "./database-guild-resource-catalog.js";
import { DatabaseMessageArchiveReader } from "./database-message-archive.js";
import { DatabaseModerationPublicationRepository } from "./database-moderation-publication.js";
import { DatabaseModerationRepository } from "./database-moderation-repository.js";
import { DatabaseModerationSystemPublicationRepository } from "./database-moderation-system-publication.js";
import { DatabaseTicketPublicationRepository } from "./database-ticket-publication.js";
import { DatabaseTicketRepository } from "./database-ticket-repository.js";
import { DatabaseVoiceAccessRepository } from "./database-voice-access-repository.js";
import { DatabaseVoicePublicationRepository } from "./database-voice-publication.js";
import { DatabaseVoiceRoomRepository } from "./database-voice-room-repository.js";
import { startGuildCore, type GuildCore } from "./guild-core.js";

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

export function createBotRuntime(config: ResolvedBotConfig): BotRuntime {
  const logger = pino({ level: config.LOG_LEVEL });
  const databaseState = config.DATABASE_URL
    ? createDatabase(config.DATABASE_URL)
    : undefined;
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildInvites,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildModeration,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.AutoModerationConfiguration,
      GatewayIntentBits.AutoModerationExecution,
    ],
    partials: [
      Partials.Channel,
      Partials.GuildMember,
      Partials.Message,
      Partials.User,
    ],
  });

  let core: GuildCore | undefined;
  let appealCore: AppealGuildCore | undefined;
  let ready = false;
  let healthServer: Server | undefined;

  return {
    async start() {
      healthServer = createHealthServer(
        config.HEALTH_PORT,
        () => ready,
        logger,
      );

      if (databaseState) {
        await databaseState.connection.unsafe("select 1");
        logger.info("postgresql connected");
      } else {
        logger.warn("postgresql disabled for this local run");
      }

      const initialized = new Promise<void>((resolve, reject) => {
        client.once(Events.ClientReady, (readyClient) => {
          void (async () => {
            try {
              const appealSetup = config.DISCORD_APPEAL_GUILD_ID
                ? await prepareAppealGuild(
                    readyClient,
                    config.DISCORD_APPEAL_GUILD_ID,
                  )
                : undefined;
              core = await startGuildCore({
                ...(appealSetup
                  ? { appealInviteUrl: appealSetup.inviteUrl }
                  : {}),
                ...(databaseState
                  ? {
                      automodPublicationRepository:
                        new DatabaseAutomodPublicationRepository(
                          databaseState.database,
                          config.DISCORD_GUILD_ID,
                        ),
                      guildResourceCatalogWriter:
                        new DatabaseGuildResourceCatalogWriter(
                          databaseState.database,
                        ),
                      messageArchiveReader: new DatabaseMessageArchiveReader(
                        databaseState.database,
                      ),
                      moderationPublicationRepository:
                        new DatabaseModerationPublicationRepository(
                          databaseState.database,
                          config.DISCORD_GUILD_ID,
                        ),
                      moderationRepository: new DatabaseModerationRepository(
                        databaseState.database,
                      ),
                      moderationSystemPublicationRepository:
                        new DatabaseModerationSystemPublicationRepository(
                          databaseState.database,
                        ),
                      ticketPublicationRepository:
                        new DatabaseTicketPublicationRepository(
                          databaseState.database,
                          config.DISCORD_GUILD_ID,
                        ),
                      ticketRepository: new DatabaseTicketRepository(
                        databaseState.database,
                      ),
                      voicePublicationRepository:
                        new DatabaseVoicePublicationRepository(
                          databaseState.database,
                          config.DISCORD_GUILD_ID,
                        ),
                      voiceAccessRepository: new DatabaseVoiceAccessRepository(
                        databaseState.database,
                      ),
                      voiceRoomRepository: new DatabaseVoiceRoomRepository(
                        databaseState.database,
                      ),
                    }
                  : {}),
                client,
                databaseConnected: Boolean(databaseState),
                guildId: config.DISCORD_GUILD_ID,
                logger,
                persistentWriters: databaseState
                  ? [new DatabaseAuditWriter(databaseState.database)]
                  : [],
              });
              if (appealSetup) {
                if (!databaseState || !core.moderationAppeals) {
                  throw new Error(
                    "Appeal guild requires PostgreSQL and the moderation module",
                  );
                }
                appealCore = await startAppealGuildCore({
                  client: readyClient,
                  logger,
                  moderationAppeals: core.moderationAppeals,
                  persistentWriters: [
                    new DatabaseAuditWriter(databaseState.database),
                  ],
                  repository: new DatabaseTicketRepository(
                    databaseState.database,
                  ),
                  setup: appealSetup,
                });
              }
              ready = true;
              logger.info(
                {
                  appealGuildId: config.DISCORD_APPEAL_GUILD_ID,
                  guildId: config.DISCORD_GUILD_ID,
                  userId: readyClient.user.id,
                },
                "fxvrlxss_ connected",
              );
              resolve();
            } catch (error) {
              reject(error instanceof Error ? error : new Error(String(error)));
            }
          })();
        });
      });

      try {
        await client.login(config.DISCORD_TOKEN);
        await initialized;
      } catch (error) {
        ready = false;
        await client.destroy();
        throw error;
      }
    },
    async stop() {
      ready = false;
      await appealCore?.stop();
      await core?.stop();
      await client.destroy();
      if (healthServer) {
        await new Promise<void>((resolve, reject) => {
          healthServer?.close((error) => {
            if (error) reject(error);
            else resolve();
          });
        });
      }
      await databaseState?.connection.end({ timeout: 5 });
    },
  };
}
