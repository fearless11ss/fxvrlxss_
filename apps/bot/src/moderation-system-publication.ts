import {
  moderationSystemConfigSchema,
  type ModerationSystemConfig,
} from "@fxvrlxss/domain/moderation-system-config";
import type { Logger } from "pino";

export interface ModerationSystemVersionRecord {
  readonly id: string;
  readonly payload: unknown;
  readonly version: number;
}

export interface ModerationSystemPublicationRepository {
  findLatestPublished(): Promise<ModerationSystemVersionRecord | null>;
  findNextQueued(): Promise<ModerationSystemVersionRecord | null>;
  markFailed(
    record: ModerationSystemVersionRecord,
    reason: string,
  ): Promise<void>;
  markPublished(record: ModerationSystemVersionRecord): Promise<void>;
}

export interface ModerationSystemConfigurationApplier {
  apply(config: ModerationSystemConfig): Promise<void>;
}

export class ModerationSystemPublicationWorker {
  readonly #applier: ModerationSystemConfigurationApplier;
  readonly #intervalMs: number;
  readonly #logger: Logger;
  readonly #repository: ModerationSystemPublicationRepository;
  #current: Promise<void> | undefined;
  #timer: NodeJS.Timeout | undefined;

  constructor(options: {
    readonly applier: ModerationSystemConfigurationApplier;
    readonly intervalMs?: number;
    readonly logger: Logger;
    readonly repository: ModerationSystemPublicationRepository;
  }) {
    this.#applier = options.applier;
    this.#intervalMs = options.intervalMs ?? 5_000;
    this.#logger = options.logger;
    this.#repository = options.repository;
  }

  async start(): Promise<void> {
    const published = await this.#repository.findLatestPublished();
    if (published) {
      const parsed = moderationSystemConfigSchema.safeParse(published.payload);
      if (parsed.success) await this.#applier.apply(parsed.data);
      else {
        this.#logger.error(
          { version: published.version },
          "published moderation system configuration is invalid",
        );
      }
    }
    await this.checkNow();
    this.#timer = setInterval(() => void this.checkNow(), this.#intervalMs);
    this.#timer.unref();
  }

  checkNow(): Promise<void> {
    if (this.#current) return this.#current;
    const current = this.#synchronize().finally(() => {
      if (this.#current === current) this.#current = undefined;
    });
    this.#current = current;
    return current;
  }

  async stop(): Promise<void> {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
    await this.#current;
  }

  async #synchronize(): Promise<void> {
    const queued = await this.#repository.findNextQueued();
    if (!queued) return;
    const parsed = moderationSystemConfigSchema.safeParse(queued.payload);
    if (!parsed.success) {
      await this.#repository.markFailed(
        queued,
        "Configuration payload failed schema validation",
      );
      return;
    }
    try {
      await this.#applier.apply(parsed.data);
      await this.#repository.markPublished(queued);
      this.#logger.info(
        { version: queued.version },
        "moderation system configuration published",
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.#repository.markFailed(queued, reason.slice(0, 2_000));
      this.#logger.error(
        { error, version: queued.version },
        "moderation system configuration publication failed",
      );
    }
  }
}
