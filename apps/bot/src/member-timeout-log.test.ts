import { describe, expect, it } from "vitest";

import {
  describeMemberTimeoutChange,
  findMemberTimeoutAuditContext,
} from "./member-timeout-log.js";

describe("member timeout audit wording", () => {
  const before = Date.parse("2026-11-16T08:00:00.000Z");
  const after = Date.parse("2026-11-16T10:00:00.000Z");

  it("distinguishes issuing, changing, and removing a timeout", () => {
    expect(describeMemberTimeoutChange(null, after)).toEqual({
      summary: "Тайм-аут выдан до <t:1794823200:F> (<t:1794823200:R>).",
      title: "Тайм-аут выдан",
    });
    expect(describeMemberTimeoutChange(before, after)).toEqual({
      summary: "Тайм-аут продлён: <t:1794816000:F> → <t:1794823200:F>.",
      title: "Тайм-аут продлён",
    });
    expect(describeMemberTimeoutChange(after, before)).toEqual({
      summary: "Срок тайм-аута сокращён: <t:1794823200:F> → <t:1794816000:F>.",
      title: "Срок тайм-аута сокращён",
    });
    expect(describeMemberTimeoutChange(before, null)).toEqual({
      summary: "Тайм-аут снят.",
      title: "Тайм-аут снят",
    });
  });

  it("finds the moderator and reason for the matching timeout change", () => {
    const occurredAt = Date.parse("2026-11-17T10:30:00.000Z");
    expect(
      findMemberTimeoutAuditContext(
        [
          {
            changes: [{ key: "nick" }],
            createdTimestamp: occurredAt - 100,
            executorId: "wrong-moderator",
            reason: "не тот тип изменения",
            targetId: "user-1",
          },
          {
            changes: [{ key: "communication_disabled_until" }],
            createdTimestamp: occurredAt - 250,
            executorId: "moderator-1",
            reason: "нарушение правил",
            targetId: "user-1",
          },
        ],
        "user-1",
        occurredAt,
      ),
    ).toEqual({ actorId: "moderator-1", reason: "нарушение правил" });
    expect(
      describeMemberTimeoutChange(before, null, {
        actorId: "moderator-1",
        reason: "нарушение правил",
      }),
    ).toEqual({
      summary: [
        "Тайм-аут снят.",
        "Инициатор: <@moderator-1>.",
        "Причина: нарушение правил.",
      ].join("\n"),
      title: "Тайм-аут снят",
    });
  });
});
