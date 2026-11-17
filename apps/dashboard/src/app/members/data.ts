import "server-only";

import {
  auditEvents,
  discordResourceCatalog,
  moderationCases,
  tickets,
} from "@fxvrlxss/database/schema";
import { and, desc, eq, like, or } from "drizzle-orm";

import { getDatabase } from "../../lib/database";
import { getDashboardEnvironment } from "../../lib/environment";
import { eventTypeLabel } from "../logs/format";
import type { MemberFilters } from "./filters";
import {
  buildMemberDirectory,
  filterMemberDirectory,
  type DirectoryMember,
} from "./model";

const PAGE_SIZE = 24;

const actionLabels = {
  ban: "Бан",
  kick: "Кик",
  timeout: "Тайм-аут",
  warn: "Предупреждение",
} as const;

const caseStatusLabels = {
  appealed: "Обжалуется",
  open: "Активно",
  resolved: "Завершено",
} as const;

const appealOutcomeLabels = {
  approved: "Апелляция одобрена",
  denied: "Апелляция отклонена",
  withdrawn: "Апелляция отозвана",
} as const;

const ticketTypeLabels: Readonly<Record<string, string>> = {
  help: "Помощь",
  "member-report": "Жалоба на участника",
  partnership: "Сотрудничество",
  "punishment-appeal": "Обжалование наказания",
};

const ticketStatusLabels = {
  claimed: "Назначен",
  closed: "Закрыт",
  open: "Открыт",
  reopened: "Открыт повторно",
} as const;

export interface MemberHistoryEntry {
  readonly href?: string;
  readonly id: string;
  readonly kind: "case" | "event" | "ticket";
  readonly label: string;
  readonly meta: readonly string[];
  readonly occurredAt: Date;
  readonly summary: string;
  readonly title: string;
  readonly tone: "attention" | "neutral" | "resolved";
}

export interface MembersPageData {
  readonly filteredCount: number;
  readonly members: readonly DirectoryMember[];
  readonly page: number;
  readonly pageCount: number;
  readonly resourceNames: Readonly<Record<string, string>>;
  readonly selected?: DirectoryMember & {
    readonly history: readonly MemberHistoryEntry[];
    readonly roles: readonly {
      readonly id: string;
      readonly name: string;
    }[];
  };
  readonly stats: {
    readonly attention: number;
    readonly current: number;
    readonly total: number;
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function caseHistoryEntry(
  moderationCase: typeof moderationCases.$inferSelect,
): MemberHistoryEntry {
  const meta = [
    `Дело #${String(moderationCase.number).padStart(4, "0")}`,
    caseStatusLabels[moderationCase.status],
  ];
  if (moderationCase.points > 0) meta.push(`+${moderationCase.points} балл.`);
  if (moderationCase.appealOutcome) {
    meta.push(appealOutcomeLabels[moderationCase.appealOutcome]);
  }
  const timeout =
    moderationCase.appliedAction === "timeout" && moderationCase.timeoutMinutes
      ? ` на ${moderationCase.timeoutMinutes} мин.`
      : "";
  return {
    id: `case:${moderationCase.id}`,
    kind: "case",
    label: "Модерация",
    meta,
    occurredAt: moderationCase.createdAt,
    summary: [
      moderationCase.summary,
      moderationCase.resolutionReason
        ? `Решение: ${moderationCase.resolutionReason}`
        : "",
      moderationCase.appealReason
        ? `Апелляция: ${moderationCase.appealReason}`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
    title: `${actionLabels[moderationCase.appliedAction]}${timeout}`,
    tone: moderationCase.status === "resolved" ? "resolved" : "attention",
  };
}

function ticketHistoryEntry(
  ticket: typeof tickets.$inferSelect,
): MemberHistoryEntry {
  const number = String(ticket.number).padStart(4, "0");
  const meta = [
    `Тикет #${number}`,
    ticketStatusLabels[ticket.status],
    ticketTypeLabels[ticket.type] ?? ticket.type,
  ];
  if (ticket.moderationCaseNumber) {
    meta.push(`Дело #${String(ticket.moderationCaseNumber).padStart(4, "0")}`);
  }
  return {
    ...(ticket.channelDeletedAt
      ? {}
      : {
          href: `https://discord.com/channels/${ticket.guildId}/${ticket.channelId}`,
        }),
    id: `ticket:${ticket.id}`,
    kind: "ticket",
    label: "Обращение",
    meta,
    occurredAt: ticket.createdAt,
    summary: [
      ticket.subject,
      ticket.closeReason ? `Закрытие: ${ticket.closeReason}` : "",
      ticket.channelDeletedAt
        ? "Канал удалён, запись и транскрипт сохранены."
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
    title: ticketTypeLabels[ticket.type] ?? "Тикет",
    tone: ticket.status === "closed" ? "resolved" : "neutral",
  };
}

function auditHistoryEntry(
  event: typeof auditEvents.$inferSelect,
): MemberHistoryEntry {
  const payload = record(event.payload) ?? {};
  return {
    id: `event:${event.id}`,
    kind: "event",
    label: "Сервер",
    meta: [eventTypeLabel(event.eventType)],
    occurredAt: event.occurredAt,
    summary: text(payload.summary, "Подробности события не сохранены."),
    title: text(payload.title, eventTypeLabel(event.eventType)),
    tone: event.severity === "info" ? "neutral" : "attention",
  };
}

export async function getMembersPageData(
  filters: MemberFilters,
): Promise<MembersPageData> {
  const database = getDatabase();
  const { guildId } = getDashboardEnvironment();
  const now = new Date();
  const [catalogRows, caseRows, ticketRows, resourceRows] = await Promise.all([
    database
      .select({
        id: discordResourceCatalog.resourceId,
        name: discordResourceCatalog.name,
        roleIds: discordResourceCatalog.roleIds,
        username: discordResourceCatalog.parentName,
      })
      .from(discordResourceCatalog)
      .where(
        and(
          eq(discordResourceCatalog.guildId, guildId),
          eq(discordResourceCatalog.kind, "member"),
        ),
      ),
    database
      .select()
      .from(moderationCases)
      .where(eq(moderationCases.guildId, guildId)),
    database.select().from(tickets),
    database
      .select({
        id: discordResourceCatalog.resourceId,
        kind: discordResourceCatalog.kind,
        name: discordResourceCatalog.name,
        position: discordResourceCatalog.position,
      })
      .from(discordResourceCatalog)
      .where(eq(discordResourceCatalog.guildId, guildId)),
  ]);
  const directory = buildMemberDirectory({
    cases: caseRows,
    members: catalogRows.map(({ id, name, roleIds, username }) => ({
      id,
      name,
      roleIds,
      ...(username ? { username } : {}),
    })),
    now,
    tickets: ticketRows,
  });
  const filtered = filterMemberDirectory(directory, filters);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(filters.page, pageCount);
  const members = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selectedMember =
    directory.find(({ id }) => id === filters.memberId) ?? members[0];
  const selectedId = selectedMember?.id;
  const selectedRoles = selectedMember
    ? resourceRows
        .filter(
          ({ id, kind }) =>
            kind === "role" && selectedMember.roleIds.includes(id),
        )
        .sort((left, right) => right.position - left.position)
        .map(({ id, name }) => ({ id, name }))
    : [];
  const auditRows = selectedId
    ? await database
        .select()
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.guildId, guildId),
            or(
              eq(auditEvents.actorId, selectedId),
              eq(auditEvents.subjectId, selectedId),
            ),
            or(
              like(auditEvents.eventType, "member.%"),
              like(auditEvents.eventType, "voice.%"),
            ),
          ),
        )
        .orderBy(desc(auditEvents.occurredAt))
        .limit(100)
    : [];
  const history = selectedId
    ? [
        ...caseRows
          .filter(({ userId }) => userId === selectedId)
          .map(caseHistoryEntry),
        ...ticketRows
          .filter(({ authorId }) => authorId === selectedId)
          .map(ticketHistoryEntry),
        ...auditRows.map(auditHistoryEntry),
      ]
        .sort(
          (left, right) =>
            right.occurredAt.getTime() - left.occurredAt.getTime(),
        )
        .slice(0, 100)
    : [];
  return {
    filteredCount: filtered.length,
    members,
    page,
    pageCount,
    resourceNames: Object.fromEntries(
      resourceRows.map(({ id, name }) => [id, name]),
    ),
    ...(selectedMember
      ? { selected: { ...selectedMember, history, roles: selectedRoles } }
      : {}),
    stats: {
      attention: directory.filter(({ activeCaseCount }) => activeCaseCount > 0)
        .length,
      current: directory.filter(({ present }) => present).length,
      total: directory.length,
    },
  };
}
