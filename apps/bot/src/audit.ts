import type { Logger } from "pino";

export type AuditCategory =
  "security" | "moderation" | "messages" | "server" | "bot";

export type AuditSeverity = "info" | "warning" | "critical";

export type AuditDiscordEntity =
  | { readonly id: string; readonly kind: "channel" }
  | { readonly id: string; readonly kind: "role" }
  | { readonly id: string; readonly kind: "user" }
  | {
      readonly channelId: string;
      readonly id: string;
      readonly kind: "message";
    };

export interface NewAuditEvent {
  readonly actor?: AuditDiscordEntity;
  readonly category: AuditCategory;
  readonly discord: boolean;
  readonly eventType: string;
  readonly payload?: Readonly<Record<string, unknown>>;
  readonly severity?: AuditSeverity;
  readonly subject?: AuditDiscordEntity;
  readonly summary: string;
  readonly title: string;
}

export interface AuditEvent extends NewAuditEvent {
  readonly guildId: string;
  readonly occurredAt: Date;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly severity: AuditSeverity;
}

export interface AuditWriter {
  readonly name: string;
  write(event: AuditEvent): Promise<void>;
}

export class AuditBus {
  readonly #guildId: string;
  readonly #logger: Logger;
  readonly #writers: readonly AuditWriter[];
  #queue: Promise<void> = Promise.resolve();

  constructor(
    guildId: string,
    writers: readonly AuditWriter[],
    logger: Logger,
  ) {
    this.#guildId = guildId;
    this.#writers = writers;
    this.#logger = logger;
  }

  publish(input: NewAuditEvent): Promise<void> {
    const event: AuditEvent = {
      ...input,
      guildId: this.#guildId,
      occurredAt: new Date(),
      payload: input.payload ?? {},
      severity: input.severity ?? "info",
    };

    const write = async () => {
      const results = await Promise.allSettled(
        this.#writers.map(async (writer) => {
          await writer.write(event);
          return writer.name;
        }),
      );
      for (const [index, result] of results.entries()) {
        if (result.status === "fulfilled") continue;
        this.#logger.error(
          {
            error: result.reason,
            eventType: event.eventType,
            writer: this.#writers[index]?.name,
          },
          "audit writer failed",
        );
      }
    };

    this.#queue = this.#queue.then(write, write);
    return this.#queue;
  }

  async drain(): Promise<void> {
    await this.#queue;
  }
}
