import { defaultVoiceConfig } from "@fxvrlxss/domain/voice-config";
import pino from "pino";
import { describe, expect, it, vi } from "vitest";

import {
  VoicePublicationWorker,
  type VoicePublicationRepository,
  type VoiceVersionRecord,
} from "./voice-publication.js";

class MemoryRepository implements VoicePublicationRepository {
  failed: string[] = [];
  published: string[] = [];
  queued: VoiceVersionRecord | null = null;

  findLatestPublished(): Promise<VoiceVersionRecord | null> {
    return Promise.resolve(null);
  }

  findNextQueued(): Promise<VoiceVersionRecord | null> {
    return Promise.resolve(this.queued);
  }

  markFailed(record: VoiceVersionRecord): Promise<void> {
    this.failed.push(record.id);
    return Promise.resolve();
  }

  markPublished(record: VoiceVersionRecord): Promise<void> {
    this.published.push(record.id);
    return Promise.resolve();
  }
}

describe("VoicePublicationWorker", () => {
  it("applies a queued version before acknowledging publication", async () => {
    const repository = new MemoryRepository();
    repository.queued = {
      id: "voice-2",
      payload: defaultVoiceConfig,
      version: 2,
    };
    const apply = vi.fn(() => Promise.resolve());
    const worker = new VoicePublicationWorker({
      applier: { apply },
      logger: pino({ level: "silent" }),
      repository,
    });

    await worker.checkNow();

    expect(apply).toHaveBeenCalledWith(defaultVoiceConfig);
    expect(repository.published).toEqual(["voice-2"]);
    expect(repository.failed).toEqual([]);
  });

  it("rejects invalid queued settings", async () => {
    const repository = new MemoryRepository();
    repository.queued = { id: "voice-bad", payload: {}, version: 3 };
    const apply = vi.fn(() => Promise.resolve());
    const worker = new VoicePublicationWorker({
      applier: { apply },
      logger: pino({ level: "silent" }),
      repository,
    });

    await worker.checkNow();

    expect(apply).not.toHaveBeenCalled();
    expect(repository.failed).toEqual(["voice-bad"]);
  });
});
