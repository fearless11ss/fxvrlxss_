import { describe, expect, it } from "vitest";

import {
  describeMemberRoleChange,
  findMemberRoleAuditContext,
} from "./member-role-log.js";

const addedRole = { id: "role-member", name: "Участник" };

describe("member role audit logging", () => {
  it("suppresses an unconfirmed cache reconciliation after restart", () => {
    expect(
      describeMemberRoleChange({
        addedRoles: [addedRole],
        auditContext: null,
        removedRoles: [],
      }),
    ).toBeNull();
  });

  it("describes a confirmed manual role change with actor and reason", () => {
    expect(
      describeMemberRoleChange({
        addedRoles: [addedRole],
        auditContext: {
          actorId: "moderator-1",
          reason: "доступ восстановлен",
        },
        removedRoles: [{ id: "role-old", name: "Старая роль" }],
      }),
    ).toEqual({
      actorId: "moderator-1",
      summary: [
        "Добавлены роли: Участник.",
        "Сняты роли: Старая роль.",
        "Инициатор: <@moderator-1>.",
        "Причина: доступ восстановлен.",
      ].join("\n"),
      title: "Роли участника изменены",
    });
  });

  it("does not duplicate the dedicated member-join log", () => {
    expect(
      describeMemberRoleChange({
        addedRoles: [addedRole],
        auditContext: {
          actorId: "bot-1",
          reason: "fxvrlxss_ automatic member onboarding",
        },
        removedRoles: [],
      }),
    ).toBeNull();
  });

  it("matches the audit entry by target, time, and changed role", () => {
    const occurredAt = Date.parse("2026-11-17T10:47:07.000Z");
    expect(
      findMemberRoleAuditContext(
        [
          {
            changes: [{ key: "$add", new: [{ id: "some-other-role" }] }],
            createdTimestamp: occurredAt - 50,
            executorId: "wrong-moderator",
            reason: null,
            targetId: "user-1",
          },
          {
            changes: [{ key: "$add", new: [{ id: "role-member" }] }],
            createdTimestamp: occurredAt - 100,
            executorId: "moderator-1",
            reason: "ручная выдача",
            targetId: "user-1",
          },
        ],
        {
          addedRoleIds: ["role-member"],
          occurredAt,
          removedRoleIds: [],
          userId: "user-1",
        },
      ),
    ).toEqual({ actorId: "moderator-1", reason: "ручная выдача" });
  });
});
