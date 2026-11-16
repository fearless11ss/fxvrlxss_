import { ComponentType } from "discord.js";
import { describe, expect, it, vi } from "vitest";

import { defaultTicketConfig } from "@fxvrlxss/domain/ticket-config";
import {
  appealEligibilityMessage,
  buildTicketControls,
  buildTicketPanel,
  completeDeferredTicketClose,
  describeTicketChannelDeletion,
  setTicketMemberSendPermissions,
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
  moderationCaseNumber: null,
  number: 42,
  participantIds: [],
  status: "open",
  subject: "Нужна помощь",
  type: "help",
};

describe("ticket Components V2", () => {
  it("explains that a resolved appeal cannot be submitted twice", () => {
    expect(
      appealEligibilityMessage({
        eligible: false,
        reason: "already-reviewed",
      }),
    ).toBe(
      "Апелляция по этому делу уже была рассмотрена. Повторное обжалование недоступно.",
    );
  });
  it("finishes a deferred close response even when closing fails", async () => {
    const editReply = vi.fn(() => Promise.resolve());

    await expect(
      completeDeferredTicketClose({ editReply }, () =>
        Promise.reject(new Error("close failed")),
      ),
    ).rejects.toThrow("close failed");
    expect(editReply).toHaveBeenCalledWith(
      "Не удалось завершить закрытие тикета. Ошибка записана в журнал бота.",
    );
  });

  it("marks permission overwrites as members when users are not cached", async () => {
    const edit = vi.fn(
      (
        _userId: string,
        _permissions: unknown,
        options?: { readonly type?: number },
      ) => {
        if (options?.type !== 1) {
          return Promise.reject(new Error("InvalidType"));
        }
        return Promise.resolve();
      },
    );

    await expect(
      setTicketMemberSendPermissions({ edit }, ["uncached-user"], false),
    ).resolves.toBeUndefined();
  });
  it("keeps a deleted ticket channel mention and permanent ID", () => {
    const summary = describeTicketChannelDeletion({
      channelId: "1571430097158668319",
      channelName: "тикет-0005",
      ticketNumber: 5,
    });

    expect(summary).toContain("Удалён канал закрытого тикета #0005.");
    expect(summary).toContain("Название: тикет-0005");
    expect(summary).toContain(
      "Ссылка: <#1571430097158668319> · ID: 1571430097158668319",
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

  it("gives every panel render a fresh select identity", () => {
    const first = JSON.stringify(
      buildTicketPanel(defaultTicketConfig, "render-1"),
    );
    const second = JSON.stringify(
      buildTicketPanel(defaultTicketConfig, "render-2"),
    );

    expect(first).not.toBe(second);
    expect(first).toContain("ticket:type:render-1");
    expect(second).toContain("ticket:type:render-2");
  });

  it("renders ticket identity and staff controls", () => {
    const controls = buildTicketControls(
      ticket,
      defaultTicketConfig,
    )[0]?.toJSON();
    const serialized = JSON.stringify(controls);

    expect(serialized).toContain("Тикет #0042");
    expect(serialized).toContain("<@user-1>");
    expect(serialized).toContain("**Тема:** Нужна помощь");
    expect(serialized).toContain("**Описание:** Подробное описание обращения");
    expect(serialized).toContain("ticket:claim");
    expect(serialized).toContain("ticket:close");
  });

  it("shows the linked moderation case in an appeal ticket", () => {
    const controls = buildTicketControls(
      {
        ...ticket,
        moderationCaseNumber: 17,
        type: "punishment-appeal",
      },
      defaultTicketConfig,
    )[0]?.toJSON();

    expect(JSON.stringify(controls)).toContain("Дело модерации: **#0017**");
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

  it("does not reopen an appeal after its decision", () => {
    const controls = buildTicketControls(
      {
        ...ticket,
        moderationCaseNumber: 17,
        status: "closed",
        type: "punishment-appeal",
      },
      defaultTicketConfig,
    )[0]?.toJSON();
    const serialized = JSON.stringify(controls);

    expect(serialized).not.toContain("ticket:reopen");
    expect(serialized).toContain("ticket:delete");
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
