import { escapeMarkdown } from "discord.js";

export interface MemberTimeoutAuditContext {
  readonly actorId: string;
  readonly reason: string | null;
}

export interface MemberTimeoutAuditEntry {
  readonly changes: readonly { readonly key: string }[];
  readonly createdTimestamp: number;
  readonly executorId: string | null;
  readonly reason: string | null;
  readonly targetId: string | null;
}

export interface MemberTimeoutChangeDescription {
  readonly summary: string;
  readonly title: string;
}

function discordTimestamp(timestamp: number, style: "F" | "R"): string {
  return `<t:${Math.floor(timestamp / 1_000)}:${style}>`;
}

function withAuditContext(
  summary: string,
  context: MemberTimeoutAuditContext | null | undefined,
): string {
  if (context === undefined) return summary;
  if (context === null) {
    return [
      summary,
      "Инициатор: не удалось определить.",
      "Причина: не удалось получить из аудита Discord.",
    ].join("\n");
  }
  return [
    summary,
    `Инициатор: <@${context.actorId}>.`,
    context.reason
      ? `Причина: ${escapeMarkdown(context.reason)}.`
      : "Причина: не указана.",
  ].join("\n");
}

export function findMemberTimeoutAuditContext(
  entries: readonly MemberTimeoutAuditEntry[],
  userId: string,
  occurredAt: number,
): MemberTimeoutAuditContext | null {
  const entry = entries
    .filter(
      (candidate) =>
        candidate.targetId === userId &&
        candidate.executorId !== null &&
        Math.abs(candidate.createdTimestamp - occurredAt) <= 10_000 &&
        candidate.changes.some(
          ({ key }) => key === "communication_disabled_until",
        ),
    )
    .sort(
      (left, right) =>
        Math.abs(left.createdTimestamp - occurredAt) -
        Math.abs(right.createdTimestamp - occurredAt),
    )[0];
  if (!entry?.executorId) return null;
  return {
    actorId: entry.executorId,
    reason: entry.reason?.trim() || null,
  };
}

export function describeMemberTimeoutChange(
  before: number | null,
  after: number | null,
  occurredAt: number,
  auditContext?: MemberTimeoutAuditContext | null,
): MemberTimeoutChangeDescription {
  const beforeActive = before !== null && before > occurredAt;
  const afterActive = after !== null && after > occurredAt;
  if (!beforeActive && afterActive && after !== null) {
    return {
      summary: withAuditContext(
        `Тайм-аут выдан до ${discordTimestamp(after, "F")} (${discordTimestamp(after, "R")}).`,
        auditContext,
      ),
      title: "Тайм-аут выдан",
    };
  }
  if (beforeActive && !afterActive) {
    return {
      summary: withAuditContext("Тайм-аут снят.", auditContext),
      title: "Тайм-аут снят",
    };
  }
  if (beforeActive && afterActive && before !== null && after !== null) {
    const extended = after > before;
    return {
      summary: withAuditContext(
        `${extended ? "Тайм-аут продлён" : "Срок тайм-аута сокращён"}: ${discordTimestamp(before, "F")} → ${discordTimestamp(after, "F")}.`,
        auditContext,
      ),
      title: extended ? "Тайм-аут продлён" : "Срок тайм-аута сокращён",
    };
  }
  if (!afterActive && before !== after) {
    return {
      summary: withAuditContext("Тайм-аут снят.", auditContext),
      title: "Тайм-аут снят",
    };
  }
  return { summary: "Тайм-аут не изменился.", title: "Тайм-аут не изменился" };
}

export function describeNaturalMemberTimeoutExpiry(
  timeoutUntil: number,
): MemberTimeoutChangeDescription {
  return {
    summary: `Срок тайм-аута истёк ${discordTimestamp(timeoutUntil, "R")}.`,
    title: "Тайм-аут завершён",
  };
}
