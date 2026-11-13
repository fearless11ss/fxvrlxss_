import pino from "pino";
import { describe, expect, it } from "vitest";

import { AuditBus, type AuditEvent, type AuditWriter } from "./audit.js";

class RecordingWriter implements AuditWriter {
  readonly name: string;
  readonly events: AuditEvent[] = [];
  readonly #fail: boolean;

  constructor(name: string, fail = false) {
    this.name = name;
    this.#fail = fail;
  }

  write(event: AuditEvent): Promise<void> {
    if (this.#fail) return Promise.reject(new Error("expected writer failure"));
    this.events.push(event);
    return Promise.resolve();
  }
}

function event(eventType: string) {
  return {
    category: "bot" as const,
    discord: true,
    eventType,
    summary: eventType,
    title: eventType,
  };
}

describe("AuditBus", () => {
  it("serializes events in publication order", async () => {
    const writer = new RecordingWriter("recording");
    const bus = new AuditBus("guild-1", [writer], pino({ level: "silent" }));

    await Promise.all([
      bus.publish(event("first")),
      bus.publish(event("second")),
    ]);

    expect(writer.events.map(({ eventType }) => eventType)).toEqual([
      "first",
      "second",
    ]);
    expect(writer.events[0]?.guildId).toBe("guild-1");
  });

  it("isolates a failed writer and continues the queue", async () => {
    const failed = new RecordingWriter("failed", true);
    const healthy = new RecordingWriter("healthy");
    const bus = new AuditBus(
      "guild-1",
      [failed, healthy],
      pino({ level: "silent" }),
    );

    await bus.publish(event("survives"));
    await bus.publish(event("continues"));

    expect(healthy.events.map(({ eventType }) => eventType)).toEqual([
      "survives",
      "continues",
    ]);
  });
});
