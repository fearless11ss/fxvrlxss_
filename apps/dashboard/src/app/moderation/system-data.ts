import "server-only";

import { configurationVersions } from "@fxvrlxss/database/schema";
import {
  moderationSystemConfigSchema,
  type ModerationSystemConfig,
} from "@fxvrlxss/domain/moderation-system-config";
import { desc, eq } from "drizzle-orm";

import { getDatabase } from "../../lib/database";
import {
  getAutomodResourceOptions,
  getAutomodSnapshot,
  type AutomodResourceOptions,
} from "../automod/data";
import { getModerationPageData, type ModerationRoleOption } from "./data";

export type ModerationSystemPublicationStatus =
  "draft" | "failed" | "new" | "published" | "queued" | "superseded";

export interface ModerationSystemSnapshot {
  readonly config: ModerationSystemConfig;
  readonly failureReason?: string;
  readonly status: ModerationSystemPublicationStatus;
  readonly version: number;
}

export async function getModerationSystemPageData(): Promise<{
  readonly activeCaseCount: number;
  readonly resources: AutomodResourceOptions;
  readonly roles: readonly ModerationRoleOption[];
  readonly snapshot: ModerationSystemSnapshot;
}> {
  const [rows, legacyAutomod, legacyManual, resources] = await Promise.all([
    getDatabase()
      .select({
        failureReason: configurationVersions.failureReason,
        payload: configurationVersions.payload,
        status: configurationVersions.status,
        version: configurationVersions.version,
      })
      .from(configurationVersions)
      .where(eq(configurationVersions.module, "moderation-system"))
      .orderBy(desc(configurationVersions.version))
      .limit(1),
    getAutomodSnapshot(),
    getModerationPageData(),
    getAutomodResourceOptions(),
  ]);
  const row = rows[0];
  const fallback: ModerationSystemConfig = {
    automod: legacyAutomod.config,
    manual: legacyManual.snapshot.config,
  };
  const parsed = row
    ? moderationSystemConfigSchema.safeParse(row.payload)
    : undefined;
  return {
    activeCaseCount: legacyManual.activeCaseCount,
    resources,
    roles: legacyManual.roles,
    snapshot: row
      ? {
          config: parsed?.success ? parsed.data : fallback,
          ...(row.failureReason ? { failureReason: row.failureReason } : {}),
          status: row.status,
          version: row.version,
        }
      : { config: fallback, status: "new", version: 0 },
  };
}
