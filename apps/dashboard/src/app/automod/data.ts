import "server-only";

import { configurationVersions } from "@fxvrlxss/database/schema";
import {
  automodConfigSchema,
  defaultAutomodConfig,
  type AutomodConfig,
} from "@fxvrlxss/domain/automod-config";
import { desc, eq } from "drizzle-orm";

import { getDatabase } from "../../lib/database";

export type AutomodPublicationStatus =
  "draft" | "failed" | "new" | "published" | "queued" | "superseded";

export interface AutomodSnapshot {
  readonly config: AutomodConfig;
  readonly failureReason?: string;
  readonly status: AutomodPublicationStatus;
  readonly version: number;
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
