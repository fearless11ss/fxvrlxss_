import { describe, expect, it } from "vitest";

import { AutomodSignalLogGate } from "./automod-signal-log-gate.js";

describe("automod security log coalescing", () => {
  it("publishes one card per matching spam burst", () => {
    const gate = new AutomodSignalLogGate(15_000);
    const repeatedSpam = {
      action: "timeout",
      channelId: "channel-1",
      signals: ["repeated-message"],
      userId: "user-1",
    } as const;

    expect(gate.shouldPublish(repeatedSpam, 0)).toBe(true);
    expect(gate.shouldPublish(repeatedSpam, 1_000)).toBe(false);
    expect(gate.shouldPublish(repeatedSpam, 2_000)).toBe(false);
    expect(
      gate.shouldPublish({ ...repeatedSpam, signals: ["flood"] }, 2_000),
    ).toBe(true);
    expect(
      gate.shouldPublish({ ...repeatedSpam, channelId: "channel-2" }, 2_000),
    ).toBe(true);
    expect(
      gate.shouldPublish({ ...repeatedSpam, userId: "user-2" }, 2_000),
    ).toBe(true);
    expect(gate.shouldPublish(repeatedSpam, 17_001)).toBe(true);
  });
});
