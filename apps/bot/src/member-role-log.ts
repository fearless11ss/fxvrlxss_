import { escapeMarkdown } from "discord.js";

export interface MemberRoleReference {
  readonly id: string;
  readonly name: string;
}

export interface MemberRoleAuditContext {
  readonly actorId: string;
  readonly reason: string | null;
}

export interface MemberRoleAuditEntry {
  readonly changes: readonly {
    readonly key: string;
    readonly new?: unknown;
    readonly old?: unknown;
  }[];
  readonly createdTimestamp: number;
  readonly executorId: string | null;
  readonly reason: string | null;
  readonly targetId: string | null;
}

export interface MemberRoleChangeDescription {
  readonly actorId: string;
  readonly summary: string;
  readonly title: string;
}

const AUTOMATIC_ONBOARDING_REASON = "fxvrlxss_ automatic member onboarding";

function roleIds(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  const roles: unknown[] = value;
  return roles.flatMap((role) =>
    role && typeof role === "object" && "id" in role ? [String(role.id)] : [],
  );
}

export function findMemberRoleAuditContext(
  entries: readonly MemberRoleAuditEntry[],
  input: {
    readonly addedRoleIds: readonly string[];
    readonly occurredAt: number;
    readonly removedRoleIds: readonly string[];
    readonly userId: string;
  },
): MemberRoleAuditContext | null {
  if (input.addedRoleIds.length === 0 && input.removedRoleIds.length === 0) {
    return null;
  }
  const entry = entries
    .filter((candidate) => {
      if (
        candidate.targetId !== input.userId ||
        candidate.executorId === null ||
        Math.abs(candidate.createdTimestamp - input.occurredAt) > 10_000
      ) {
        return false;
      }
      const added = candidate.changes
        .filter(({ key }) => key === "$add")
        .flatMap((change) => roleIds(change.new ?? change.old));
      const removed = candidate.changes
        .filter(({ key }) => key === "$remove")
        .flatMap((change) => roleIds(change.new ?? change.old));
      return (
        input.addedRoleIds.every((roleId) => added.includes(roleId)) &&
        input.removedRoleIds.every((roleId) => removed.includes(roleId))
      );
    })
    .sort(
      (left, right) =>
        Math.abs(left.createdTimestamp - input.occurredAt) -
        Math.abs(right.createdTimestamp - input.occurredAt),
    )[0];
  if (!entry?.executorId) return null;
  return {
    actorId: entry.executorId,
    reason: entry.reason?.trim() || null,
  };
}

export function describeMemberRoleChange(input: {
  readonly addedRoles: readonly MemberRoleReference[];
  readonly auditContext: MemberRoleAuditContext | null;
  readonly removedRoles: readonly MemberRoleReference[];
}): MemberRoleChangeDescription | null {
  if (
    input.auditContext === null ||
    input.auditContext.reason === AUTOMATIC_ONBOARDING_REASON
  ) {
    return null;
  }
  return {
    actorId: input.auditContext.actorId,
    summary: [
      input.addedRoles.length > 0
        ? `Добавлены роли: ${input.addedRoles.map(({ name }) => name).join(", ")}.`
        : "",
      input.removedRoles.length > 0
        ? `Сняты роли: ${input.removedRoles.map(({ name }) => name).join(", ")}.`
        : "",
      `Инициатор: <@${input.auditContext.actorId}>.`,
      input.auditContext.reason
        ? `Причина: ${escapeMarkdown(input.auditContext.reason)}.`
        : "Причина: не указана.",
    ]
      .filter(Boolean)
      .join("\n"),
    title: "Роли участника изменены",
  };
}
