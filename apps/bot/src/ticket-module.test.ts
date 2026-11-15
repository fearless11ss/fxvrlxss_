import { ComponentType } from "discord.js";
import { describe, expect, it } from "vitest";

import { defaultTicketConfig } from "@fxvrlxss/domain/ticket-config";
import {
  buildTicketControls,
  buildTicketPanel,
  describeTicketChannelDeletion,
} from "./ticket-module.js";
import type { TicketRecord } from "./ticket-repository.js";

const ticket: TicketRecord = {
  assignedToId: null,
  authorId: "user-1",
  channelId: "channel-1",
  channelDeletedAt: null,
  controlMessageId: "message-1",
  description: "Подробное описание обращения",
  id: "ticket-1",
  number: 42,
  participantIds: [],
  status: "open",
  subject: "Нужна помощь",
  type: "help",
};

describe("ticket Components V2", () => {
  it("keeps a deleted ticket channel mention and permanent ID", () => {
    const summary = describeTicketChannelDeletion({
      channelId: "1571430097158668319",
      channelName: "тикет-0005",
      ticketNumber: 5,
    });

    expect(summary).toContain("тикета #0005 тикет-0005");
    expect(summary).toContain(
      "Канал: <#1571430097158668319> · ID: 1571430097158668319",
    );
    expect(summary).toContain("Запись и транскрипт сохранены в PostgreSQL.");
    expect(summary).not.toContain("`тикет-0005`");
  });

  it("builds the four-type support panel", () => {
    const panel = buildTicketPanel(defaultTicketConfig)[0]?.toJSON();

    expect(panel?.type).toBe(ComponentType.Container);
    expect(JSON.stringify(panel)).toContain("ticket:type");
    expect(JSON.stringify(panel)).toContain("Помощь");
    expect(JSON.stringify(panel)).toContain("Жалоба на участника");
    expect(JSON.stringify(panel)).toContain("Обжалование наказания");
    expect(JSON.stringify(panel)).toContain("Сотрудничество");
  });

  it("renders ticket identity and staff controls", () => {
    const controls = buildTicketControls(
      ticket,
      defaultTicketConfig,
    )[0]?.toJSON();
    const serialized = JSON.stringify(controls);

    expect(serialized).toContain("Тикет #0042");
    expect(serialized).toContain("<@user-1>");
    expect(serialized).toContain("ticket:claim");
    expect(serialized).toContain("ticket:close");
  });

  it("offers reopening and safe channel deletion for a closed ticket", () => {
    const controls = buildTicketControls(
      { ...ticket, status: "closed" },
      defaultTicketConfig,
    )[0]?.toJSON();
    const serialized = JSON.stringify(controls);

    expect(serialized).toContain("ticket:reopen");
    expect(serialized).toContain("ticket:delete");
    expect(serialized).not.toContain("ticket:claim");
  });

  it("does not offer Discord actions after the channel is deleted", () => {
    const controls = buildTicketControls(
      { ...ticket, channelDeletedAt: new Date(), status: "closed" },
      defaultTicketConfig,
    )[0]?.toJSON();
    const serialized = JSON.stringify(controls);

    expect(serialized).not.toContain("ticket:reopen");
    expect(serialized).not.toContain("ticket:delete");
  });
});
