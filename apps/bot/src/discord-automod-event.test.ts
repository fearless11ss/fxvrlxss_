import { describe, expect, it } from "vitest";

import { buildDiscordAutomodSourceEventKey } from "./discord-automod-event.js";

describe("buildDiscordAutomodSourceEventKey", () => {
  it("does not merge separate blocked messages when Discord omits message ids", () => {
    const event = {
      alertSystemMessageId: null,
      matchedContent: "https://discord.gg/example",
      messageId: null,
      ruleId: "rule-1",
      userId: "user-1",
    };

    const occurrenceIds = ["occurrence-1", "occurrence-2"];
    const createOccurrenceId = () => occurrenceIds.shift() ?? "unexpected";

    expect(
      buildDiscordAutomodSourceEventKey(event, createOccurrenceId),
    ).not.toBe(buildDiscordAutomodSourceEventKey(event, createOccurrenceId));
  });

  it("keeps Discord message ids stable for duplicate deliveries", () => {
    const event = {
      alertSystemMessageId: null,
      matchedContent: "https://discord.gg/example",
      messageId: "message-1",
      ruleId: "rule-1",
      userId: "user-1",
    };
    const createOccurrenceId = () => "must-not-be-used";

    expect(buildDiscordAutomodSourceEventKey(event, createOccurrenceId)).toBe(
      "discord-automod:rule-1:message-1",
    );
  });
});
