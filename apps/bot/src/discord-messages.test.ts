import { ComponentType } from "discord.js";
import { describe, expect, it } from "vitest";

import type { AuditEvent } from "./audit.js";
import {
  buildAuditComponents,
  buildLifecycleComponents,
  buildStatusComponents,
} from "./discord-messages.js";

const auditEvent: AuditEvent = {
  actor: { id: "user-1", kind: "user" },
  category: "security",
  discord: true,
  eventType: "test.event",
  guildId: "guild-1",
  occurredAt: new Date("2026-11-13T08:00:00.000Z"),
  payload: {},
  severity: "warning",
  subject: { channelId: "channel-1", id: "message-1", kind: "message" },
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
    expect(JSON.stringify(container)).toContain("<@user-1>");
    expect(JSON.stringify(container)).toContain(
      "https://discord.com/channels/guild-1/channel-1/message-1",
    );
    expect(JSON.stringify(container)).not.toContain("Исполнитель: `user-1`");
  });

  it("renders channels and roles as Discord mentions", () => {
    const channel = buildAuditComponents({
      ...auditEvent,
      subject: { id: "channel-1", kind: "channel" },
    })[0]?.toJSON();
    const role = buildAuditComponents({
      ...auditEvent,
      subject: { id: "role-1", kind: "role" },
    })[0]?.toJSON();

    expect(JSON.stringify(channel)).toContain("<#channel-1>");
    expect(JSON.stringify(role)).toContain("<@&role-1>");
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
