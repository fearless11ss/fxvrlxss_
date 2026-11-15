import { describe, expect, it } from "vitest";

import {
  describeVoiceRoomLifecycle,
  type VoiceRoomSnapshot,
} from "./voice-room-log.js";

const snapshot: VoiceRoomSnapshot = {
  bannedIds: ["blocked-1"],
  channelId: "voice-1",
  createdAt: "2026-11-15T06:00:00.000Z",
  hidden: true,
  locked: true,
  name: "Комната fxvrlxss_",
  ownerId: "owner-1",
  trustedIds: ["friend-1", "friend-2"],
  userLimit: 4,
};

describe("temporary voice lifecycle logs", () => {
  it("combines a channel mention with its permanent ID", () => {
    const summary = describeVoiceRoomLifecycle("created", snapshot);

    expect(summary).toContain("Комната fxvrlxss_");
    expect(summary).toContain("Канал: <#voice-1> · ID: voice-1");
    expect(summary).toContain("Владелец: <@owner-1>");
    expect(summary).toContain("вход закрыт · скрыта · лимит 4");
    expect(summary).toContain("доверенных — 2 · забаненных — 1");
    expect(summary).not.toContain("`voice-1`");
  });

  it("includes both lifecycle timestamps after deletion", () => {
    const summary = describeVoiceRoomLifecycle("deleted", {
      ...snapshot,
      deletedAt: "2026-11-15T07:00:00.000Z",
    });

    expect(summary).toContain("Создана: <t:1794722400:F>");
    expect(summary).toContain("Удалена: <t:1794726000:F>");
  });
});
