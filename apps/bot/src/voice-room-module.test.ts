import { describe, expect, it } from "vitest";

import { defaultVoiceConfig } from "@fxvrlxss/domain/voice-config";
import {
  buildVoiceAccessManager,
  buildVoiceRoomControls,
} from "./voice-room-module.js";
import type { VoiceAccessEntry } from "./voice-access-repository.js";
import type { VoiceRoomRecord } from "./voice-room-repository.js";

const room: VoiceRoomRecord = {
  channelId: "voice-1",
  controlMessageId: "control-1",
  guildId: "guild-1",
  hidden: false,
  locked: false,
  ownerId: "owner-1",
  userLimit: 0,
};

describe("temporary voice Components V2", () => {
  it("builds an in-room panel with every enabled owner action", () => {
    const controls = buildVoiceRoomControls(
      room,
      defaultVoiceConfig,
      "Комната владельца",
    ).map((component) => component.toJSON());
    const serialized = JSON.stringify(controls);

    expect(serialized).toContain("Временные голосовые комнаты");
    expect(serialized).toContain("<@owner-1>");
    expect(controls[0]).toMatchObject({
      content: "<@owner-1>",
      type: 10,
    });
    expect(serialized).toContain("voice:rename:open");
    expect(serialized).toContain("voice:limit:open");
    expect(serialized).toContain("voice:lock");
    expect(serialized).toContain("voice:hide");
    expect(serialized).toContain("voice:access:trusted:open");
    expect(serialized).toContain("voice:access:banned:open");
    expect(serialized).toContain("voice:owner:open");
    expect(serialized).toContain("без лимита");
  });

  it("renders the current private-room state", () => {
    const controls = buildVoiceRoomControls(
      { ...room, hidden: true, locked: true, userLimit: 4 },
      defaultVoiceConfig,
      "Закрытая комната",
    ).map((component) => component.toJSON());
    const serialized = JSON.stringify(controls);

    expect(serialized).toContain("Открыть вход");
    expect(serialized).toContain("Показать");
    expect(serialized).toContain("лимит 4");
  });

  it("renders a persistent owner access list", () => {
    const entries: VoiceAccessEntry[] = [
      {
        guildId: "guild-1",
        kind: "trusted",
        ownerId: "owner-1",
        subjectId: "friend-1",
      },
      {
        guildId: "guild-1",
        kind: "banned",
        ownerId: "owner-1",
        subjectId: "blocked-1",
      },
    ];
    const controls = buildVoiceAccessManager("trusted", entries)[0]?.toJSON();
    const serialized = JSON.stringify(controls);

    expect(serialized).toContain("<@friend-1>");
    expect(serialized).not.toContain("<@blocked-1>");
    expect(serialized).toContain("voice:access:trusted:add:open");
    expect(serialized).toContain("voice:access:trusted:remove:open");
    expect(serialized).toContain("всех его будущих комнат");
  });
});
