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
  it("atomically replaces thresholds and calculates configured points", () => {
    const runtime = new AutomodRuntime();
    runtime.apply({
      ...defaultAutomodConfig,
      caps: { ...defaultAutomodConfig.caps, enabled: false },
      emojiSpam: { ...defaultAutomodConfig.emojiSpam, enabled: false },
      flood: {
        action: "points",
        enabled: true,
        maximumMessages: 2,
        points: 2,
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
    expect(decision.action).toBe("observe");
    expect(decision.points).toBe(2);
    expect(decision.findings.map(({ signal }) => signal)).toContain("flood");
  });

  it("counts one point action once when two signals share its rule", () => {
    const runtime = new AutomodRuntime({
      ...defaultAutomodConfig,
      attachmentPolicy: {
        ...defaultAutomodConfig.attachmentPolicy,
        action: "points",
        allowImages: false,
        maximumPerWindow: 1,
        points: 3,
      },
      mode: "enforce",
    });

    const decision = runtime.inspect({
      ...message("attachment", 1_000),
      attachments: [{ contentType: "image/png", name: "image.png", size: 10 }],
    });

    expect(decision.findings.map(({ signal }) => signal)).toEqual(
      expect.arrayContaining(["attachment-rate", "attachment-type"]),
    );
    expect(decision.points).toBe(3);
  });

  it("takes the largest point value and suppresses direct actions in points mode", () => {
    const runtime = new AutomodRuntime({
      ...defaultAutomodConfig,
      caps: {
        ...defaultAutomodConfig.caps,
        action: "points",
        points: 2,
      },
      emojiSpam: {
        ...defaultAutomodConfig.emojiSpam,
        action: "points",
        maximum: 2,
        points: 5,
      },
      messageLength: {
        ...defaultAutomodConfig.messageLength,
        action: "kick",
        enabled: true,
        maximumCharacters: 5,
      },
      mode: "points",
    });

    const decision = runtime.inspect({
      ...message("combined", 1_000),
      content: "ЭТО ОЧЕНЬ ДЛИННО 😀😀😀",
    });

    expect(decision.action).toBe("observe");
    expect(decision.configuredAction).toBe("kick");
    expect(decision.points).toBe(5);
  });

  it("reports findings without sanctions in observation mode", () => {
    const runtime = new AutomodRuntime({
      ...defaultAutomodConfig,
      flood: {
        action: "quarantine",
        enabled: true,
        maximumMessages: 2,
        points: 0,
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

    runtime.inspect({ ...message("first", 1_000), content: "same" });
    const decision = runtime.inspect({
      ...message("second", 2_000),
      content: "same",
    });
    expect(decision.action).toBe("timeout");
    expect(decision.timeoutMinutes).toBe(90);
  });

  it("routes the message-length signal through the configured sanction", () => {
    const runtime = new AutomodRuntime({
      ...defaultAutomodConfig,
      messageLength: {
        action: "kick",
        enabled: true,
        maximumCharacters: 3,
        points: 0,
        timeoutMinutes: 10,
      },
      mode: "enforce",
    });

    const decision = runtime.inspect({
      ...message("long-message", 1_000),
      content: "длинное сообщение",
    });
    expect(decision.action).toBe("kick");
    expect(decision.findings.map(({ signal }) => signal)).toContain(
      "message-length",
    );
  });
});
