import { Collection, ComponentType } from "discord.js";
import { describe, expect, it, vi } from "vitest";

import {
  buildModerationCard,
  buildModerationNotice,
  buildModerationNoticeComponents,
  ModerationModule,
} from "./moderation-module.js";
import type { ModerationCaseRecord } from "./moderation-repository.js";

const item: ModerationCaseRecord = {
  appliedAction: "timeout",
  appealOutcome: null,
  appealReason: null,
  appealResolvedAt: null,
  appealResolvedById: null,
  createdAt: new Date("2026-11-15T08:00:00.000Z"),
  evidence: { reference: null },
  expiresAt: new Date("2027-02-13T08:00:00.000Z"),
  guildId: "guild-1",
  id: "case-1",
  moderatorId: "staff-1",
  number: 7,
  points: 2,
  requestedAction: "timeout",
  resolutionReason: null,
  resolvedAt: null,
  resolvedById: null,
  sourceEventKey: null,
  status: "open",
  summary: "Причина",
  timeoutMinutes: 60,
  userId: "user-1",
};

describe("manual moderation Components V2", () => {
  it("coalesces repeated automod sanctions without throttling point cases", async () => {
    const applyTimeout = vi.fn(() => Promise.resolve());
    const create = vi.fn(
      (input: {
        appliedAction: ModerationCaseRecord["appliedAction"];
        points: number;
        requestedAction: ModerationCaseRecord["requestedAction"];
        sourceEventKey?: string;
      }) =>
        Promise.resolve({
          created: true,
          record: {
            ...item,
            appliedAction: input.appliedAction,
            number: create.mock.calls.length,
            points: input.points,
            requestedAction: input.requestedAction,
            sourceEventKey: input.sourceEventKey ?? null,
          },
        }),
    );
    const moderation = new ModerationModule({
      audit: { publish: vi.fn(() => Promise.resolve()) } as never,
      guild: {
        channels: { fetch: vi.fn() },
        client: {
          user: { id: "bot-1" },
          users: {
            fetch: vi.fn(() =>
              Promise.resolve({ send: vi.fn(() => Promise.resolve()) }),
            ),
          },
        },
        id: "guild-1",
        members: {
          fetch: vi.fn(() =>
            Promise.resolve({ moderatable: true, timeout: applyTimeout }),
          ),
        },
        name: "test",
        roles: { cache: new Collection() },
      } as never,
      logger: {} as never,
      quarantineRoleId: "quarantine-1",
      repository: {
        activePoints: vi.fn(() => Promise.resolve(0)),
        create,
      } as never,
      ticketChannelId: "tickets-1",
    });

    const violation = (action: "points" | "timeout", index: number) =>
      moderation.applyAutomodViolation({
        action,
        applyThresholds: action === "points",
        channelId: "channel-1",
        deleteMessage: false,
        messageId: `message-${index}`,
        points: action === "points" ? 3 : 0,
        signals: ["repeated-message"],
        sourceEventKey: `${action}-${index}`,
        summary: "повторы",
        timeoutMinutes: 120,
        userId: "user-1",
      });

    await Promise.all([1, 2, 3].map((index) => violation("timeout", index)));
    expect(applyTimeout).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();

    await Promise.all([1, 2, 3].map((index) => violation("points", index)));
    expect(create).toHaveBeenCalledTimes(4);
  });

  it("deletes a violating message before waiting for the moderation ledger", async () => {
    let releaseActivePoints: ((value: number) => void) | undefined;
    const activePoints = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          releaseActivePoints = resolve;
        }),
    );
    const removeMessage = vi.fn(() => Promise.resolve());
    const moderation = new ModerationModule({
      audit: { publish: vi.fn(() => Promise.resolve()) } as never,
      guild: {
        client: { user: { id: "bot-1" } },
        id: "guild-1",
        roles: { cache: new Collection() },
      } as never,
      logger: {} as never,
      quarantineRoleId: "quarantine-1",
      repository: { activePoints } as never,
      ticketChannelId: "tickets-1",
    });

    const operation = moderation.applyAutomodViolation({
      action: "observe",
      applyThresholds: false,
      channelId: "channel-1",
      deleteMessage: true,
      message: { deletable: true, delete: removeMessage } as never,
      messageId: "message-1",
      points: 0,
      signals: ["flood"],
      sourceEventKey: "event-1",
      summary: "флуд",
      timeoutMinutes: 10,
      userId: "user-1",
    });
    await vi.waitFor(() => expect(activePoints).toHaveBeenCalledOnce());
    const deletedBeforeLedger = removeMessage.mock.calls.length;
    releaseActivePoints?.(0);
    await operation;

    expect(deletedBeforeLedger).toBe(1);
  });

  it("builds a member card with every sanction action", () => {
    const card = buildModerationCard({
      activePoints: 2,
      cases: [item],
      userId: "user-1",
    })[0]?.toJSON();
    const serialized = JSON.stringify(card);

    expect(card?.type).toBe(ComponentType.Container);
    expect(serialized).toContain("Карточка участника");
    expect(serialized).toContain("<@user-1>");
    expect(serialized).toContain("#0007");
    expect(serialized).toContain("moderation:apply:open:warn:user-1");
    expect(serialized).toContain("moderation:apply:open:timeout:user-1");
    expect(serialized).toContain("moderation:apply:open:kick:user-1");
    expect(serialized).toContain("moderation:apply:open:ban:user-1");
    expect(serialized).toContain("moderation:history:user-1");
  });

  it("uses a short informal ban notice with the external appeal invite", () => {
    const notice = buildModerationNotice({
      action: "ban",
      appealUrl: "https://discord.gg/appeal",
      caseNumber: 12,
      points: 6,
      serverName: "fxvrlxss_",
      summary: "стороннее приглашение Discord",
    });

    expect(notice).toBe(
      [
        "Вы получили бан на сервере **fxvrlxss\\_**.",
        "Причина — стороннее приглашение Discord.",
        "Дело: **#0012**",
        "",
        "Подать апелляцию: https://discord.gg/appeal",
      ].join("\n"),
    );
    expect(notice).not.toContain("удален");
    expect(notice).not.toContain("#чат");
  });

  it("sends non-ban sanctions to the main ticket channel", () => {
    const notice = buildModerationNotice({
      action: "timeout",
      appealUrl: "https://discord.com/channels/guild/tickets",
      caseNumber: 13,
      points: 0,
      serverName: "fxvrlxss_",
      summary: "флуд",
      timeoutMinutes: 60,
    });

    expect(notice).toContain(
      "Вы получили тайм-аут на сервере **fxvrlxss\\_** на **60 мин.**.",
    );
    expect(notice).toContain(
      "Подать апелляцию: https://discord.com/channels/guild/tickets",
    );
  });

  it("renders member direct messages with Components V2", () => {
    const component = buildModerationNoticeComponents({
      action: "timeout",
      appealUrl: "https://discord.com/channels/guild/tickets",
      caseNumber: 7,
      points: 0,
      serverName: "test",
      summary: "повторы",
      timeoutMinutes: 120,
    })[0]?.toJSON();
    const serialized = JSON.stringify(component);

    expect(component?.type).toBe(ComponentType.Container);
    expect(serialized).toContain("## Тайм-аут");
    expect(serialized).toContain("Дело: **#0007**");
    expect(serialized).toContain("https://discord.com/channels/guild/tickets");
  });
});
