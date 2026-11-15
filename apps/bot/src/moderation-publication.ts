import {
  moderationConfigSchema,
  type ModerationConfig,
} from "@fxvrlxss/domain/moderation-config";
import type { Logger } from "pino";

export interface ModerationVersionRecord {
  readonly id: string;
  readonly payload: unknown;
  readonly version: number;
}

export interface ModerationPublicationRepository {
  findLatestPublished(): Promise<ModerationVersionRecord | null>;
  findNextQueued(): Promise<ModerationVersionRecord | null>;
  markFailed(record: ModerationVersionRecord, reason: string): Promise<void>;
  markPublished(record: ModerationVersionRecord): Promise<void>;
}

export interface ModerationConfigurationApplier {
  apply(config: ModerationConfig): Promise<void>;
}

export class ModerationPublicationWorker {
  readonly #applier: ModerationConfigurationApplier;
  readonly #intervalMs: number;
  readonly #logger: Logger;
  readonly #repository: ModerationPublicationRepository;
  #current: Promise<void> | undefined;
  #timer: NodeJS.Timeout | undefined;

  constructor(options: {
    readonly applier: ModerationConfigurationApplier;
    readonly intervalMs?: number;
    readonly logger: Logger;
    readonly repository: ModerationPublicationRepository;
  }) {
    this.#applier = options.applier;
    this.#intervalMs = options.intervalMs ?? 5_000;
    this.#logger = options.logger;
    this.#repository = options.repository;
  }

  async start(): Promise<void> {
    const published = await this.#repository.findLatestPublished();
    if (published) {
      const parsed = moderationConfigSchema.safeParse(published.payload);
      if (parsed.success) await this.#applier.apply(parsed.data);
      else {
        this.#logger.error(
          { version: published.version },
          "published moderation configuration is invalid",
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
    const parsed = moderationConfigSchema.safeParse(queued.payload);
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
        "moderation configuration published",
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.#repository.markFailed(queued, reason.slice(0, 2_000));
      this.#logger.error(
        { error, version: queued.version },
        "moderation configuration publication failed",
      );
    }
  }
}
