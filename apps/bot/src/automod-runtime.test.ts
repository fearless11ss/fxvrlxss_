import { defaultAutomodConfig } from "@fxvrlxss/domain/automod-config";
import { describe, expect, it } from "vitest";

import { AutomodRuntime } from "./automod-runtime.js";

function message(id: string, createdAt: number) {
  return {
    attachments: [],
    channelId: "channel-1",
    content: id,
    createdAt,
    id,
    userId: "user-1",
  };
}

describe("AutomodRuntime", () => {
  it("atomically replaces thresholds and applies the strictest action", () => {
    const runtime = new AutomodRuntime();
    runtime.apply({
      ...defaultAutomodConfig,
      caps: { ...defaultAutomodConfig.caps, enabled: false },
      emojiSpam: { ...defaultAutomodConfig.emojiSpam, enabled: false },
      flood: {
        action: "timeout",
        enabled: true,
        maximumMessages: 2,
        timeoutMinutes: 25,
        windowSeconds: 10,
      },
      mode: "enforce",
      repeatedMessages: {
        ...defaultAutomodConfig.repeatedMessages,
        enabled: false,
      },
    });

    expect(runtime.inspect(message("first", 1_000)).action).toBe("observe");
    const decision = runtime.inspect(message("second", 2_000));
    expect(decision.action).toBe("timeout");
    expect(decision.timeoutMinutes).toBe(25);
    expect(decision.findings.map(({ signal }) => signal)).toContain("flood");
  });

  it("reports findings without sanctions in observation mode", () => {
    const runtime = new AutomodRuntime({
      ...defaultAutomodConfig,
      flood: {
        action: "quarantine",
        enabled: true,
        maximumMessages: 2,
        timeoutMinutes: 10,
        windowSeconds: 10,
      },
    });
    runtime.inspect(message("first", 1_000));
    expect(runtime.inspect(message("second", 2_000)).action).toBe("observe");
  });

  it("selects the strongest sanction and its rule-specific timeout", () => {
    const runtime = new AutomodRuntime({
      ...defaultAutomodConfig,
      caps: { ...defaultAutomodConfig.caps, enabled: false },
      emojiSpam: { ...defaultAutomodConfig.emojiSpam, enabled: false },
      flood: {
        ...defaultAutomodConfig.flood,
        action: "timeout",
        maximumMessages: 2,
        timeoutMinutes: 15,
        windowSeconds: 60,
      },
      mode: "enforce",
      repeatedMessages: {
        ...defaultAutomodConfig.repeatedMessages,
        action: "timeout",
        maximumRepeats: 2,
        timeoutMinutes: 90,
        windowSeconds: 60,
      },
    });

    runtime.inspect(message("same", 1_000));
    const decision = runtime.inspect(message("same", 2_000));
    expect(decision.action).toBe("timeout");
    expect(decision.timeoutMinutes).toBe(90);
  });
});
