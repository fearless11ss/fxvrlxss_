import { defaultAutomodConfig } from "@fxvrlxss/domain/automod-config";
import pino from "pino";
import { describe, expect, it, vi } from "vitest";

import {
  AutomodPublicationWorker,
  type AutomodPublicationRepository,
  type AutomodVersionRecord,
} from "./automod-publication.js";

class MemoryRepository implements AutomodPublicationRepository {
  failed: string[] = [];
  published: string[] = [];
  queued: AutomodVersionRecord | null = null;

  findLatestPublished(): Promise<AutomodVersionRecord | null> {
    return Promise.resolve(null);
  }

  findNextQueued(): Promise<AutomodVersionRecord | null> {
    return Promise.resolve(this.queued);
  }

  markFailed(record: AutomodVersionRecord): Promise<void> {
    this.failed.push(record.id);
    return Promise.resolve();
  }

  markPublished(record: AutomodVersionRecord): Promise<void> {
    this.published.push(record.id);
    return Promise.resolve();
  }
}

describe("AutomodPublicationWorker", () => {
  it("applies a queued version before acknowledging publication", async () => {
    const repository = new MemoryRepository();
    repository.queued = {
      id: "config-2",
      payload: defaultAutomodConfig,
      version: 2,
    };
    const apply = vi.fn(() => Promise.resolve());
    const worker = new AutomodPublicationWorker({
      applier: { apply },
      intervalMs: 60_000,
      logger: pino({ level: "silent" }),
      repository,
    });

    await worker.checkNow();

    expect(apply).toHaveBeenCalledWith(defaultAutomodConfig);
    expect(repository.published).toEqual(["config-2"]);
    expect(repository.failed).toEqual([]);
  });

  it("marks invalid payloads as failed without invoking the adapter", async () => {
    const repository = new MemoryRepository();
    repository.queued = { id: "config-bad", payload: {}, version: 3 };
    const apply = vi.fn(() => Promise.resolve());
    const worker = new AutomodPublicationWorker({
      applier: { apply },
      logger: pino({ level: "silent" }),
      repository,
    });

    await worker.checkNow();

    expect(apply).not.toHaveBeenCalled();
    expect(repository.failed).toEqual(["config-bad"]);
  });
});
