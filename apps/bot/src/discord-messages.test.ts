import { ComponentType } from "discord.js";
import { describe, expect, it } from "vitest";

import type { AuditEvent } from "./audit.js";
import {
  buildAuditComponents,
  buildLifecycleComponents,
  buildStatusComponents,
} from "./discord-messages.js";

const auditEvent: AuditEvent = {
  category: "security",
  discord: true,
  eventType: "test.event",
  guildId: "guild-1",
  occurredAt: new Date("2026-11-13T08:00:00.000Z"),
  payload: {},
  severity: "warning",
  summary: "Проверка события",
  title: "Тест",
};

describe("Components V2 messages", () => {
  it("builds an audit container with two text displays", () => {
    const [container] = buildAuditComponents(auditEvent).map((item) =>
      item.toJSON(),
    );

    expect(container?.type).toBe(ComponentType.Container);
    expect(container?.components).toHaveLength(2);
    expect(
      container?.components.every(
        ({ type }) => type === ComponentType.TextDisplay,
      ),
    ).toBe(true);
  });

  it("builds lifecycle containers for joins and leaves", () => {
    const joined = buildLifecycleComponents("joined", "user-1")[0]?.toJSON();
    const left = buildLifecycleComponents("left", "user-1")[0]?.toJSON();

    expect(joined?.type).toBe(ComponentType.Container);
    expect(left?.type).toBe(ComponentType.Container);
    expect(JSON.stringify(joined)).toContain("Новый участник");
    expect(JSON.stringify(left)).toContain("Участник вышел");
  });

  it("builds the owner status container with a refresh button", () => {
    const container = buildStatusComponents({
      database: true,
      guildId: "guild-1",
      ping: 42,
      startedAt: new Date("2026-11-13T08:00:00.000Z"),
    })[0]?.toJSON();

    expect(container?.type).toBe(ComponentType.Container);
    expect(JSON.stringify(container)).toContain("core:status:refresh");
    expect(JSON.stringify(container)).toContain("PostgreSQL");
  });
});
