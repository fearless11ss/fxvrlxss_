import "server-only";

import {
  configurationVersions,
  discordResourceCatalog,
} from "@fxvrlxss/database/schema";
import {
  defaultTicketConfig,
  ticketConfigSchema,
  type TicketConfig,
} from "@fxvrlxss/domain/ticket-config";
import { and, desc, eq } from "drizzle-orm";

import { getDatabase } from "../../lib/database";
import { getDashboardEnvironment } from "../../lib/environment";

export type TicketPublicationStatus =
  "draft" | "failed" | "new" | "published" | "queued" | "superseded";

export interface TicketSnapshot {
  readonly config: TicketConfig;
  readonly failureReason?: string;
  readonly status: TicketPublicationStatus;
  readonly version: number;
}

export interface TicketRoleOption {
  readonly id: string;
  readonly name: string;
}

export async function getTicketPageData(): Promise<{
  readonly roles: readonly TicketRoleOption[];
  readonly snapshot: TicketSnapshot;
}> {
  const database = getDatabase();
  const environment = getDashboardEnvironment();
  const [versions, roleRows] = await Promise.all([
    database
      .select({
        failureReason: configurationVersions.failureReason,
        payload: configurationVersions.payload,
        status: configurationVersions.status,
        version: configurationVersions.version,
      })
      .from(configurationVersions)
      .where(eq(configurationVersions.module, "tickets"))
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
  if (!row) {
    const defaultStaffNames = new Set([
      "Владелец",
      "Куратор",
      "Модератор",
      "Испытательный срок",
    ]);
    return {
      roles,
      snapshot: {
        config: {
          ...defaultTicketConfig,
          staffRoleIds: roles
            .filter(({ name }) => defaultStaffNames.has(name))
            .map(({ id }) => id),
        },
        status: "new",
        version: 0,
      },
    };
  }
  const parsed = ticketConfigSchema.safeParse(row.payload);
  return {
    roles,
    snapshot: {
      config: parsed.success ? parsed.data : defaultTicketConfig,
      ...(row.failureReason ? { failureReason: row.failureReason } : {}),
      status: row.status,
      version: row.version,
    },
  };
}
