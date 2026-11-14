import "server-only";

import {
  configurationVersions,
  temporaryVoiceRooms,
} from "@fxvrlxss/database/schema";
import {
  defaultVoiceConfig,
  voiceConfigSchema,
  type VoiceConfig,
} from "@fxvrlxss/domain/voice-config";
import { count, desc, eq } from "drizzle-orm";

import { getDatabase } from "../../lib/database";
import { getDashboardEnvironment } from "../../lib/environment";

export type VoicePublicationStatus =
  "draft" | "failed" | "new" | "published" | "queued" | "superseded";

export interface VoiceSnapshot {
  readonly config: VoiceConfig;
  readonly failureReason?: string;
  readonly status: VoicePublicationStatus;
  readonly version: number;
}

export async function getVoicePageData(): Promise<{
  readonly activeRoomCount: number;
  readonly snapshot: VoiceSnapshot;
}> {
  const database = getDatabase();
  const environment = getDashboardEnvironment();
  const [versions, roomCounts] = await Promise.all([
    database
      .select({
        failureReason: configurationVersions.failureReason,
        payload: configurationVersions.payload,
        status: configurationVersions.status,
        version: configurationVersions.version,
      })
      .from(configurationVersions)
      .where(eq(configurationVersions.module, "voice"))
      .orderBy(desc(configurationVersions.version))
      .limit(1),
    database
      .select({ value: count() })
      .from(temporaryVoiceRooms)
      .where(eq(temporaryVoiceRooms.guildId, environment.guildId)),
  ]);
  const row = versions[0];
  return {
    activeRoomCount: roomCounts[0]?.value ?? 0,
    snapshot: row
      ? {
          config:
            voiceConfigSchema.safeParse(row.payload).data ?? defaultVoiceConfig,
          ...(row.failureReason ? { failureReason: row.failureReason } : {}),
          status: row.status,
          version: row.version,
        }
      : {
          config: defaultVoiceConfig,
          status: "new",
          version: 0,
        },
  };
}
