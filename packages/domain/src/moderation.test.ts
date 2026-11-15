import { describe, expect, it } from "vitest";

import {
  CustomModerationEngine,
  defaultModerationPolicy,
} from "./moderation.js";

function message(
  id: number,
  overrides: Partial<Parameters<CustomModerationEngine["inspect"]>[0]> = {},
) {
  return {
    attachments: [],
    channelId: "channel-1",
    content: `message ${id}`,
    createdAt: id * 1_000,
    id: String(id),
    userId: "user-1",
    ...overrides,
  };
}

describe("CustomModerationEngine", () => {
  it("detects the fifth message inside a five-second flood window", () => {
    const engine = new CustomModerationEngine();
    for (let index = 0; index < 4; index += 1) {
      expect(engine.inspect(message(index)).findings).toEqual([]);
    }

    expect(
      engine.inspect(message(4)).findings.map(({ signal }) => signal),
    ).toContain("flood");
  });

  it("detects the third normalized repeat", () => {
    const engine = new CustomModerationEngine();
    engine.inspect(message(1, { content: "  Одинаковое сообщение " }));
    engine.inspect(message(2, { content: "одинаковое   сообщение" }));
    const result = engine.inspect(
      message(3, { content: "ОДИНАКОВОЕ СООБЩЕНИЕ" }),
    );

    expect(result.findings.map(({ signal }) => signal)).toContain(
      "repeated-message",
    );
  });

  it("detects caps and excessive emoji without inspecting native AutoMod concerns", () => {
    const engine = new CustomModerationEngine();
    const result = engine.inspect(
      message(1, {
        content: "ЭТО СООБЩЕНИЕ ОЧЕНЬ ГРОМКОЕ 😀😀😀😀😀😀😀😀😀😀😀😀😀",
      }),
    );

    expect(result.findings.map(({ signal }) => signal)).toEqual([
      "caps",
      "emoji-spam",
    ]);
  });

  it("allows supported media and rejects documents", () => {
    const engine = new CustomModerationEngine();
    const allowed = engine.inspect(
      message(1, {
        attachments: [
          { contentType: "image/png", name: "frame.png", size: 1024 },
        ],
      }),
    );
    const rejected = engine.inspect(
      message(2, {
        attachments: [
          { contentType: "application/pdf", name: "document.pdf", size: 1024 },
        ],
      }),
    );

    expect(allowed.findings.map(({ signal }) => signal)).not.toContain(
      "attachment-type",
    );
    expect(rejected.findings.map(({ signal }) => signal)).toContain(
      "attachment-type",
    );
  });

  it("limits message length by Unicode characters", () => {
    const engine = new CustomModerationEngine({
      ...defaultModerationPolicy,
      messageLength: { maxCharacters: 2 },
    });

    expect(
      engine
        .inspect(message(1, { content: "😀😀" }))
        .findings.map(({ signal }) => signal),
    ).not.toContain("message-length");
    expect(
      engine
        .inspect(message(2, { content: "😀😀😀" }))
        .findings.map(({ signal }) => signal),
    ).toContain("message-length");
  });

  it("replaces an edited message instead of counting it twice for flood", () => {
    const engine = new CustomModerationEngine({
      ...defaultModerationPolicy,
      flood: { maxMessages: 2, windowMs: 10_000 },
    });

    engine.inspect(message(1, { content: "первая версия" }));
    const edited = engine.inspect(
      message(1, { content: "ИЗМЕНЁННАЯ ВЕРСИЯ", createdAt: 2_000 }),
    );

    expect(edited.findings.map(({ signal }) => signal)).not.toContain("flood");
    expect(edited.findings.map(({ signal }) => signal)).toContain("caps");
  });
});
