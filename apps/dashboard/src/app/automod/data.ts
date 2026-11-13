import "server-only";

import {
  configurationVersions,
  discordResourceCatalog,
} from "@fxvrlxss/database/schema";
import {
  automodConfigSchema,
  defaultAutomodConfig,
  type AutomodConfig,
} from "@fxvrlxss/domain/automod-config";
import { desc, eq } from "drizzle-orm";

import { getDatabase } from "../../lib/database";
import { getDashboardEnvironment } from "../../lib/environment";

export type AutomodPublicationStatus =
  "draft" | "failed" | "new" | "published" | "queued" | "superseded";

export interface AutomodSnapshot {
  readonly config: AutomodConfig;
  readonly failureReason?: string;
  readonly status: AutomodPublicationStatus;
  readonly version: number;
}

export interface AutomodResourceOption {
  readonly id: string;
  readonly name: string;
  readonly parentName?: string;
}

export interface AutomodResourceOptions {
  readonly channels: readonly AutomodResourceOption[];
  readonly roles: readonly AutomodResourceOption[];
}

export async function getAutomodResourceOptions(): Promise<AutomodResourceOptions> {
  const environment = getDashboardEnvironment();
  const rows = await getDatabase()
    .select({
      id: discordResourceCatalog.resourceId,
      kind: discordResourceCatalog.kind,
      name: discordResourceCatalog.name,
      parentName: discordResourceCatalog.parentName,
      position: discordResourceCatalog.position,
    })
    .from(discordResourceCatalog)
    .where(eq(discordResourceCatalog.guildId, environment.guildId));

  const option = (row: (typeof rows)[number]): AutomodResourceOption => ({
    id: row.id,
    name: row.name,
    ...(row.parentName ? { parentName: row.parentName } : {}),
  });
  return {
    channels: rows
      .filter(({ kind }) => kind === "channel")
      .sort(
        (left, right) =>
          (left.parentName ?? "").localeCompare(
            right.parentName ?? "",
            "ru-RU",
          ) ||
          left.position - right.position ||
          left.name.localeCompare(right.name, "ru-RU"),
      )
      .map(option),
    roles: rows
      .filter(({ kind }) => kind === "role")
      .sort(
        (left, right) =>
          right.position - left.position ||
          left.name.localeCompare(right.name, "ru-RU"),
      )
      .map(option),
  };
}

export async function getAutomodSnapshot(): Promise<AutomodSnapshot> {
  const rows = await getDatabase()
    .select({
      failureReason: configurationVersions.failureReason,
      payload: configurationVersions.payload,
      status: configurationVersions.status,
      version: configurationVersions.version,
    })
    .from(configurationVersions)
    .where(eq(configurationVersions.module, "automod"))
    .orderBy(desc(configurationVersions.version))
    .limit(1);
  const row = rows[0];
  if (!row) return { config: defaultAutomodConfig, status: "new", version: 0 };
  const parsed = automodConfigSchema.safeParse(row.payload);
  return {
    config: parsed.success ? parsed.data : defaultAutomodConfig,
    ...(row.failureReason ? { failureReason: row.failureReason } : {}),
    status: row.status,
    version: row.version,
  };
}
