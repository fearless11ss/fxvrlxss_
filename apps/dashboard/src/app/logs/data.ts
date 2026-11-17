import "server-only";

import { auditEvents, discordResourceCatalog } from "@fxvrlxss/database/schema";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import { getDatabase } from "../../lib/database";
import { getDashboardEnvironment } from "../../lib/environment";
import type { LogCategory, LogFilters, LogSeverity } from "./filters";
import { buildAuditStatsQuery } from "./queries";

const PAGE_SIZE = 25;

interface AuditReference {
  readonly channelId?: string;
  readonly id: string;
  readonly kind: "channel" | "message" | "role" | "user";
  readonly label?: string;
}

export interface LogResource {
  readonly channelId?: string;
  readonly id: string;
  readonly kind: string;
  readonly name?: string;
  readonly secondaryName?: string;
}

export interface LogEntry {
  readonly actor?: LogResource;
  readonly category: LogCategory;
  readonly eventType: string;
  readonly id: string;
  readonly occurredAt: Date;
  readonly severity: LogSeverity;
  readonly subject?: LogResource & { readonly channelId?: string };
  readonly summary: string;
  readonly technical: Readonly<Record<string, unknown>>;
  readonly title: string;
}

export interface LogsPageData {
  readonly categoryCounts: Readonly<Record<LogCategory, number>>;
  readonly entries: readonly LogEntry[];
  readonly eventTypes: readonly string[];
  readonly filteredCount: number;
  readonly page: number;
  readonly pageCount: number;
  readonly resourceNames: Readonly<Record<string, string>>;
  readonly stats: {
    readonly attention: number;
    readonly lastDay: number;
    readonly total: number;
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function reference(value: unknown): AuditReference | undefined {
  const candidate = record(value);
  const kind = candidate?.kind;
  if (
    !candidate ||
    typeof candidate.id !== "string" ||
    (kind !== "channel" &&
      kind !== "message" &&
      kind !== "role" &&
      kind !== "user")
  ) {
    return undefined;
  }
  return {
    id: candidate.id,
    kind,
    ...(typeof candidate.channelId === "string"
      ? { channelId: candidate.channelId }
      : {}),
    ...(typeof candidate.label === "string" ? { label: candidate.label } : {}),
  };
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function dateBoundary(value: string, end: boolean): Date | null {
  if (!value) return null;
  return new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}+03:00`);
}

function searchTokens(query: string): readonly string[] {
  const mentionId = query.match(/\d{6,}/u)?.[0];
  return [
    ...new Set(
      [query, mentionId].filter((value): value is string => Boolean(value)),
    ),
  ];
}

function mentionedResourceIds(value: unknown): readonly string[] {
  if (typeof value !== "string") return [];
  return [...value.matchAll(/<(?:@!?|@&|#)(\d+)>/gu)].map(
    (match) => match[1] as string,
  );
}

function categoryRecord(): Record<LogCategory, number> {
  return { bot: 0, messages: 0, moderation: 0, security: 0, server: 0 };
}

export async function getLogsPageData(
  filters: LogFilters,
): Promise<LogsPageData> {
  const database = getDatabase();
  const { guildId } = getDashboardEnvironment();
  const tokens = searchTokens(filters.query);
  const resourceMatches =
    tokens.length > 0
      ? await database
          .select({ id: discordResourceCatalog.resourceId })
          .from(discordResourceCatalog)
          .where(
            and(
              eq(discordResourceCatalog.guildId, guildId),
              or(
                ...tokens.flatMap((token) => {
                  const pattern = `%${token}%`;
                  return [
                    ilike(discordResourceCatalog.name, pattern),
                    ilike(discordResourceCatalog.parentName, pattern),
                  ];
                }),
              ),
            ),
          )
          .limit(100)
      : [];
  const matchingResourceIds = [...new Set(resourceMatches.map(({ id }) => id))];
  const conditions: SQL[] = [eq(auditEvents.guildId, guildId)];
  if (filters.category !== "all") {
    conditions.push(eq(auditEvents.category, filters.category));
  }
  if (filters.severity !== "all") {
    conditions.push(eq(auditEvents.severity, filters.severity));
  }
  if (filters.event) conditions.push(eq(auditEvents.eventType, filters.event));
  const from = dateBoundary(filters.from, false);
  const to = dateBoundary(filters.to, true);
  if (from) conditions.push(gte(auditEvents.occurredAt, from));
  if (to) conditions.push(lte(auditEvents.occurredAt, to));
  if (tokens.length > 0) {
    const matches: SQL[] = tokens.flatMap((token) => {
      const pattern = `%${token}%`;
      return [
        ilike(auditEvents.eventType, pattern),
        ilike(auditEvents.actorId, pattern),
        ilike(auditEvents.subjectId, pattern),
        sql`${auditEvents.payload}::text ILIKE ${pattern}`,
      ];
    });
    if (matchingResourceIds.length > 0) {
      matches.push(
        inArray(auditEvents.actorId, matchingResourceIds),
        inArray(auditEvents.subjectId, matchingResourceIds),
      );
    }
    conditions.push(or(...matches) as SQL);
  }
  const where = and(...conditions) as SQL;
  const sinceYesterday = new Date(Date.now() - 24 * 60 * 60 * 1_000);
  const [filteredRows, statRows, categoryRows, eventTypeRows] =
    await Promise.all([
      database.select({ value: count() }).from(auditEvents).where(where),
      buildAuditStatsQuery(database, guildId, sinceYesterday),
      database
        .select({ category: auditEvents.category, value: count() })
        .from(auditEvents)
        .where(eq(auditEvents.guildId, guildId))
        .groupBy(auditEvents.category),
      database
        .selectDistinct({ eventType: auditEvents.eventType })
        .from(auditEvents)
        .where(eq(auditEvents.guildId, guildId))
        .orderBy(asc(auditEvents.eventType)),
    ]);
  const filteredCount = Number(filteredRows[0]?.value ?? 0);
  const pageCount = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));
  const page = Math.min(filters.page, pageCount);
  const rows = await database
    .select()
    .from(auditEvents)
    .where(where)
    .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.id))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  const referencedIds = [
    ...new Set(
      rows.flatMap(({ actorId, payload, subjectId }) => {
        const auditPayload = record(payload) ?? {};
        const subjectReference = reference(auditPayload.subjectReference);
        return [
          actorId,
          subjectId,
          subjectReference?.channelId,
          ...mentionedResourceIds(auditPayload.title),
          ...mentionedResourceIds(auditPayload.summary),
        ].filter((id): id is string => Boolean(id));
      }),
    ),
  ];
  const resources =
    referencedIds.length > 0
      ? await database
          .select({
            id: discordResourceCatalog.resourceId,
            kind: discordResourceCatalog.kind,
            name: discordResourceCatalog.name,
            secondaryName: discordResourceCatalog.parentName,
          })
          .from(discordResourceCatalog)
          .where(
            and(
              eq(discordResourceCatalog.guildId, guildId),
              inArray(discordResourceCatalog.resourceId, referencedIds),
            ),
          )
      : [];
  const resourcesById = new Map(
    resources.map((resource) => [resource.id, resource]),
  );
  const entries = rows.map((row): LogEntry => {
    const payload = record(row.payload) ?? {};
    const actorReference = reference(payload.actorReference);
    const subjectReference = reference(payload.subjectReference);
    const actorCatalog = row.actorId
      ? resourcesById.get(row.actorId)
      : undefined;
    const subjectCatalog = row.subjectId
      ? resourcesById.get(row.subjectId)
      : undefined;
    const subjectChannelCatalog = subjectReference?.channelId
      ? resourcesById.get(subjectReference.channelId)
      : undefined;
    const technical = Object.fromEntries(
      Object.entries(payload).filter(
        ([key]) =>
          ![
            "actorReference",
            "discord",
            "subjectReference",
            "summary",
            "title",
          ].includes(key),
      ),
    );
    return {
      ...(row.actorId
        ? {
            actor: {
              id: row.actorId,
              kind: actorReference?.kind ?? row.actorType,
              ...(actorCatalog?.name ? { name: actorCatalog.name } : {}),
              ...(actorCatalog?.secondaryName
                ? { secondaryName: actorCatalog.secondaryName }
                : {}),
            },
          }
        : {}),
      category: row.category as LogCategory,
      eventType: row.eventType,
      id: row.id,
      occurredAt: row.occurredAt,
      severity: row.severity as LogSeverity,
      ...(row.subjectId
        ? {
            subject: {
              id: row.subjectId,
              kind: subjectReference?.kind ?? "unknown",
              ...(subjectReference?.channelId
                ? { channelId: subjectReference.channelId }
                : {}),
              ...(subjectReference?.label
                ? { name: subjectReference.label }
                : subjectCatalog?.name
                  ? { name: subjectCatalog.name }
                  : {}),
              ...(subjectCatalog?.secondaryName
                ? { secondaryName: subjectCatalog.secondaryName }
                : subjectChannelCatalog?.name
                  ? { secondaryName: `#${subjectChannelCatalog.name}` }
                  : {}),
            },
          }
        : {}),
      summary: text(payload.summary, "Подробности события не сохранены."),
      technical,
      title: text(payload.title, row.eventType),
    };
  });
  const categoryCounts = categoryRecord();
  for (const row of categoryRows) {
    if (row.category in categoryCounts) {
      categoryCounts[row.category as LogCategory] = Number(row.value);
    }
  }
  const stats = statRows[0];
  return {
    categoryCounts,
    entries,
    eventTypes: eventTypeRows.map(({ eventType }) => eventType),
    filteredCount,
    page,
    pageCount,
    resourceNames: Object.fromEntries(
      resources.flatMap(({ id, name }) => (name ? [[id, name]] : [])),
    ),
    stats: {
      attention: Number(stats?.attention ?? 0),
      lastDay: Number(stats?.lastDay ?? 0),
      total: Number(stats?.total ?? 0),
    },
  };
}
