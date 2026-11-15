import { describe, expect, it } from "vitest";

import { ChannelType } from "discord.js";

import {
  isManagedTicketChannelShape,
  shouldLogChannelEventInDiscord,
} from "./guild-core.js";

const ticketChannel = {
  id: "ticket-channel-1",
  name: "тикет-0004",
  parentId: "support-category",
  topic: "Тикет #0004 · Помощь · user-1",
  type: ChannelType.GuildText,
};

describe("channel event Discord log policy", () => {
  it("keeps ordinary channel events visible", () => {
    expect(
      shouldLogChannelEventInDiscord({
        managedTicket: false,
        temporaryVoice: false,
      }),
    ).toBe(true);
  });

  it("suppresses low-level events for managed ticket channels", () => {
    expect(
      shouldLogChannelEventInDiscord({
        managedTicket: true,
        temporaryVoice: false,
      }),
    ).toBe(false);
  });

  it("continues suppressing temporary voice channel events", () => {
    expect(
      shouldLogChannelEventInDiscord({
        managedTicket: false,
        temporaryVoice: true,
      }),
    ).toBe(false);
  });

  it("recognizes only bot-managed ticket channel shapes", () => {
    expect(
      isManagedTicketChannelShape(
        ticketChannel,
        "support-category",
        "ticket-panel",
      ),
    ).toBe(true);
    expect(
      isManagedTicketChannelShape(
        { ...ticketChannel, id: "ticket-panel" },
        "support-category",
        "ticket-panel",
      ),
    ).toBe(false);
    expect(
      isManagedTicketChannelShape(
        { ...ticketChannel, name: "ручная-помощь", topic: null },
        "support-category",
        "ticket-panel",
      ),
    ).toBe(false);
  });
});
