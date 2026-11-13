import {
  automodConfigSchema,
  type AutomodConfig,
} from "@fxvrlxss/domain/automod-config";
import type { Logger } from "pino";

export interface AutomodVersionRecord {
  readonly id: string;
  readonly payload: unknown;
  readonly version: number;
}

export interface AutomodPublicationRepository {
  findLatestPublished(): Promise<AutomodVersionRecord | null>;
  findNextQueued(): Promise<AutomodVersionRecord | null>;
  markFailed(record: AutomodVersionRecord, reason: string): Promise<void>;
  markPublished(record: AutomodVersionRecord): Promise<void>;
}

export interface AutomodConfigurationApplier {
  apply(config: AutomodConfig): Promise<void>;
}

export class AutomodPublicationWorker {
  readonly #applier: AutomodConfigurationApplier;
  readonly #intervalMs: number;
  readonly #logger: Logger;
  readonly #repository: AutomodPublicationRepository;
  #current: Promise<void> | undefined;
  #timer: NodeJS.Timeout | undefined;

  constructor(options: {
    readonly applier: AutomodConfigurationApplier;
    readonly intervalMs?: number;
    readonly logger: Logger;
    readonly repository: AutomodPublicationRepository;
  }) {
    this.#applier = options.applier;
    this.#intervalMs = options.intervalMs ?? 5_000;
    this.#logger = options.logger;
    this.#repository = options.repository;
  }

  async start(): Promise<void> {
    const published = await this.#repository.findLatestPublished();
    if (published) {
      const parsed = automodConfigSchema.safeParse(published.payload);
      if (parsed.success) await this.#applier.apply(parsed.data);
      else {
        this.#logger.error(
          { version: published.version },
          "published automod configuration is invalid",
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
    const parsed = automodConfigSchema.safeParse(queued.payload);
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
        "automod configuration published",
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.#repository.markFailed(queued, reason.slice(0, 2_000));
      this.#logger.error(
        { error, version: queued.version },
        "automod configuration publication failed",
      );
    }
  }
}
