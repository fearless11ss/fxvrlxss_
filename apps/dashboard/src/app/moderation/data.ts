import "server-only";

import {
  configurationVersions,
  discordResourceCatalog,
  moderationCases,
} from "@fxvrlxss/database/schema";
import {
  defaultModerationConfig,
  moderationConfigSchema,
  type ModerationConfig,
} from "@fxvrlxss/domain/moderation-config";
import { and, count, desc, eq, inArray } from "drizzle-orm";

import { getDatabase } from "../../lib/database";
import { getDashboardEnvironment } from "../../lib/environment";

export type ModerationPublicationStatus =
  "draft" | "failed" | "new" | "published" | "queued" | "superseded";

export interface ModerationSnapshot {
  readonly config: ModerationConfig;
  readonly failureReason?: string;
  readonly status: ModerationPublicationStatus;
  readonly version: number;
}

export interface ModerationRoleOption {
  readonly id: string;
  readonly name: string;
}

export async function getModerationPageData(): Promise<{
  readonly activeCaseCount: number;
  readonly roles: readonly ModerationRoleOption[];
  readonly snapshot: ModerationSnapshot;
}> {
  const database = getDatabase();
  const environment = getDashboardEnvironment();
  const [versions, roleRows, caseCounts] = await Promise.all([
    database
      .select({
        failureReason: configurationVersions.failureReason,
        payload: configurationVersions.payload,
        status: configurationVersions.status,
        version: configurationVersions.version,
      })
      .from(configurationVersions)
      .where(eq(configurationVersions.module, "moderation"))
      .orderBy(desc(configurationVersions.version))
      .limit(1),
    database
      .select({
        id: discordResourceCatalog.resourceId,
        name: discordResourceCatalog.name,
        position: discordResourceCatalog.position,
      })
      .from(discordResourceCatalog)
      .where(
        and(
          eq(discordResourceCatalog.guildId, environment.guildId),
          eq(discordResourceCatalog.kind, "role"),
        ),
      ),
    database
      .select({ value: count() })
      .from(moderationCases)
      .where(
        and(
          eq(moderationCases.guildId, environment.guildId),
          inArray(moderationCases.status, ["open", "appealed"]),
        ),
      ),
  ]);
  const roles = roleRows
    .filter(({ name }) => name !== "@everyone")
    .sort(
      (left, right) =>
        right.position - left.position ||
        left.name.localeCompare(right.name, "ru-RU"),
    )
    .map(({ id, name }) => ({ id, name }));
  const row = versions[0];
  const defaultStaffNames = new Set([
    "Владелец",
    "Куратор",
    "Модератор",
    "Испытательный срок",
  ]);
  const fallback: ModerationConfig = {
    ...defaultModerationConfig,
    staffRoleIds: roles
      .filter(({ name }) => defaultStaffNames.has(name))
      .map(({ id }) => id),
  };
  return {
    activeCaseCount: caseCounts[0]?.value ?? 0,
    roles,
    snapshot: row
      ? {
          config:
            moderationConfigSchema.safeParse(row.payload).data ?? fallback,
          ...(row.failureReason ? { failureReason: row.failureReason } : {}),
          status: row.status,
          version: row.version,
        }
      : { config: fallback, status: "new", version: 0 },
  };
}
