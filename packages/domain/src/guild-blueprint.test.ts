import { describe, expect, it } from "vitest";

import { productionGuildBlueprint } from "./guild-blueprint.js";

describe("productionGuildBlueprint", () => {
  it("protects the owner-approved channel ordering", () => {
    expect(
      productionGuildBlueprint.ungroupedChannels.map(({ name }) => name),
    ).toEqual(["прихожая", "правила", "навигация"]);

    expect(productionGuildBlueprint.categories.map(({ name }) => name)).toEqual(
      ["ИНФО", "ПОДДЕРЖКА", "ОБЩЕНИЕ", "ГОЛОСОВЫЕ", "КОМАНДА", "ЛОГИ"],
    );
  });

  it("models ticket and voice children as dynamic, not placeholder channels", () => {
    const support = productionGuildBlueprint.categories.find(
      ({ key }) => key === "support",
    );
    const voice = productionGuildBlueprint.categories.find(
      ({ key }) => key === "voice",
    );

    expect(support?.dynamicChildren).toBe("tickets");
    expect(support?.channels.map(({ name }) => name)).toEqual([
      "открыть-тикет",
    ]);
    expect(voice?.dynamicChildren).toBe("temporary-voice-rooms");
    expect(voice?.channels.map(({ name }) => name)).toEqual([
      "создать-комнату",
    ]);
  });

  it("keeps the bot administrator decision explicit", () => {
    const botRole = productionGuildBlueprint.roles.find(
      ({ key }) => key === "bot",
    );
    expect(botRole?.permissions).toContain("Administrator");
    expect(botRole?.managedByDiscord).toBe(true);
  });

  it("preserves the staff permissions configured in Discord", () => {
    for (const key of ["curator", "moderator", "trial"]) {
      const role = productionGuildBlueprint.roles.find(
        (candidate) => candidate.key === key,
      );
      expect(role?.permissions).toContain("ChangeNickname");
    }
  });

  it("captures the configured @everyone baseline", () => {
    expect(productionGuildBlueprint.everyonePermissionBits).toBe(
      "1056602794085953",
    );
    expect(productionGuildBlueprint.everyonePermissions).toEqual([
      "CreateInstantInvite",
      "AddReactions",
      "Stream",
      "ViewChannel",
      "SendMessages",
      "EmbedLinks",
      "AttachFiles",
      "ReadMessageHistory",
      "UseExternalEmojis",
      "Connect",
      "Speak",
      "UseVAD",
      "UseApplicationCommands",
      "RequestToSpeak",
      "CreatePublicThreads",
      "CreatePrivateThreads",
      "UseExternalStickers",
      "SendMessagesInThreads",
      "UseEmbeddedActivities",
      "SendVoiceMessages",
      "SetVoiceChannelStatus",
      "SendPolls",
    ]);
  });
});
