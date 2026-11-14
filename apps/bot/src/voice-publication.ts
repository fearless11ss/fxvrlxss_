import {
  voiceConfigSchema,
  type VoiceConfig,
} from "@fxvrlxss/domain/voice-config";
import type { Logger } from "pino";

export interface VoiceVersionRecord {
  readonly id: string;
  readonly payload: unknown;
  readonly version: number;
}

export interface VoicePublicationRepository {
  findLatestPublished(): Promise<VoiceVersionRecord | null>;
  findNextQueued(): Promise<VoiceVersionRecord | null>;
  markFailed(record: VoiceVersionRecord, reason: string): Promise<void>;
  markPublished(record: VoiceVersionRecord): Promise<void>;
}

export interface VoiceConfigurationApplier {
  apply(config: VoiceConfig): Promise<void>;
}

export class VoicePublicationWorker {
  readonly #applier: VoiceConfigurationApplier;
  readonly #intervalMs: number;
  readonly #logger: Logger;
  readonly #repository: VoicePublicationRepository;
  #current: Promise<void> | undefined;
  #timer: NodeJS.Timeout | undefined;

  constructor(options: {
    readonly applier: VoiceConfigurationApplier;
    readonly intervalMs?: number;
    readonly logger: Logger;
    readonly repository: VoicePublicationRepository;
  }) {
    this.#applier = options.applier;
    this.#intervalMs = options.intervalMs ?? 5_000;
    this.#logger = options.logger;
    this.#repository = options.repository;
  }

  async start(): Promise<void> {
    const published = await this.#repository.findLatestPublished();
    if (published) {
      const parsed = voiceConfigSchema.safeParse(published.payload);
      if (parsed.success) await this.#applier.apply(parsed.data);
      else {
        this.#logger.error(
          { version: published.version },
          "published voice configuration is invalid",
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
    const parsed = voiceConfigSchema.safeParse(queued.payload);
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
        "voice configuration published",
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.#repository.markFailed(queued, reason.slice(0, 2_000));
      this.#logger.error(
        { error, version: queued.version },
        "voice configuration publication failed",
      );
    }
  }
}
