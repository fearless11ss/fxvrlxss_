import { describe, expect, it, vi } from "vitest";

import { AsyncEventGate } from "./async-event-gate.js";

describe("AsyncEventGate", () => {
  it("rejects late work while draining an in-flight handler", async () => {
    const events: string[] = [];
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const gate = new AsyncEventGate(() => undefined);

    gate.run(async () => {
      events.push("started");
      await barrier;
      events.push("finished");
    });
    await vi.waitFor(() => expect(events).toEqual(["started"]));

    const closing = gate.close();
    gate.run(() => {
      events.push("late");
      return Promise.resolve();
    });
    await Promise.resolve();

    expect(events).toEqual(["started"]);
    release();
    await closing;
    expect(events).toEqual(["started", "finished"]);
  });
});
