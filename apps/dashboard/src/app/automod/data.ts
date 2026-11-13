import "server-only";

import { configurationVersions } from "@fxvrlxss/database/schema";
import {
  automodConfigSchema,
  defaultAutomodConfig,
  type AutomodConfig,
} from "@fxvrlxss/domain/automod-config";
import { and, desc, eq } from "drizzle-orm";

import { getDatabase } from "../../lib/database";

export interface AutomodDraft {
  readonly config: AutomodConfig;
  readonly version: number;
}

export async function getAutomodDraft(): Promise<AutomodDraft> {
  const rows = await getDatabase()
    .select({
      payload: configurationVersions.payload,
      version: configurationVersions.version,
    })
    .from(configurationVersions)
    .where(
      and(
        eq(configurationVersions.module, "automod"),
        eq(configurationVersions.status, "draft"),
      ),
    )
    .orderBy(desc(configurationVersions.version))
    .limit(1);
  const row = rows[0];
  if (!row) return { config: defaultAutomodConfig, version: 0 };
  const parsed = automodConfigSchema.safeParse(row.payload);
  return parsed.success
    ? { config: parsed.data, version: row.version }
    : { config: defaultAutomodConfig, version: row.version };
}
