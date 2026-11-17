import type { Database } from "@fxvrlxss/database/client";
import { auditEvents } from "@fxvrlxss/database/schema";
import { count, eq, gte, sql } from "drizzle-orm";

export function buildAuditStatsQuery(
  database: Pick<Database, "select">,
  guildId: string,
  since: Date,
) {
  return database
    .select({
      attention: sql<number>`count(*) filter (where ${auditEvents.severity} in ('warning', 'critical'))`,
      lastDay: sql<number>`count(*) filter (where ${gte(
        auditEvents.occurredAt,
        since,
      )})`,
      total: count(),
    })
    .from(auditEvents)
    .where(eq(auditEvents.guildId, guildId));
}
