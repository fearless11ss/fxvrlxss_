import { describe, expect, it } from "vitest";

import { buildDeletedMessageLog } from "./deleted-message-log.js";

describe("deleted message log", () => {
  it("uses archived content and references the channel instead of the deleted message", () => {
    const result = buildDeletedMessageLog(
      {
        attachments: [],
        channelId: "channel-1",
        content: null,
        messageId: "message-1",
      },
      {
        attachments: [],
        authorId: "user-1",
        channelId: "channel-1",
        content: "Текст удалённого сообщения",
        messageId: "message-1",
      },
    );

    expect(result.actorId).toBe("user-1");
    expect(result.subject).toEqual({ id: "channel-1", kind: "channel" });
    expect(result.summary).toContain("Текст удалённого сообщения");
    expect(result.summary).not.toContain("содержимое недоступно");
  });

  it("keeps an explicit fallback when neither Discord nor the archive has text", () => {
    const result = buildDeletedMessageLog(
      {
        attachments: [],
        channelId: "channel-1",
        content: null,
        messageId: "message-1",
      },
      null,
    );

    expect(result.summary).toContain("содержимое недоступно");
  });
});
