import { defaultAutomodConfig } from "@fxvrlxss/domain/automod-config";
import { describe, expect, it } from "vitest";

import { buildAutomodLogSummary } from "./automod-log.js";

describe("automod Discord log summary", () => {
  it("names every matched rule with evidence and configured sanctions", () => {
    const summary = buildAutomodLogSummary(
      {
        ...defaultAutomodConfig,
        flood: {
          ...defaultAutomodConfig.flood,
          timeoutMinutes: 15,
          windowSeconds: 8,
        },
        mode: "observe",
        repeatedMessages: {
          ...defaultAutomodConfig.repeatedMessages,
          timeoutMinutes: 120,
          windowSeconds: 300,
        },
      },
      {
        action: "observe",
        configuredAction: "timeout",
        deleteMessage: false,
        findings: [
          { details: { messages: 7 }, signal: "flood" },
          { details: { repeats: 7 }, signal: "repeated-message" },
        ],
        points: 0,
        timeoutMinutes: 120,
      },
      "channel-1",
    );

    expect(summary).toContain("Канал: <#channel-1>");
    expect(summary).toContain("Флуд: 7 сообщений за 8 сек.");
    expect(summary).toContain("тайм-аут на 15 мин.");
    expect(summary).toContain("Повторы: 7 одинаковых сообщений за 300 сек.");
    expect(summary).toContain("тайм-аут на 120 мин.");
    expect(summary).toContain("наказание не применялось");
    expect(summary).toContain("Удаление: отключено режимом наблюдения");
  });
});
