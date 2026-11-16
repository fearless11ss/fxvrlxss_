import { ComponentType } from "discord.js";
import { describe, expect, it } from "vitest";

import {
  buildModerationCard,
  buildModerationNotice,
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
});
