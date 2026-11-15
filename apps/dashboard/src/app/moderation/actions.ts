"use server";

import { auditEvents, configurationVersions } from "@fxvrlxss/database/schema";
import { moderationConfigSchema } from "@fxvrlxss/domain/moderation-config";
import { and, eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireOwnerSession } from "../../lib/auth";
import { getDatabase } from "../../lib/database";
import { getDashboardEnvironment } from "../../lib/environment";

export interface ModerationActionState {
  readonly error?: string;
  readonly message?: string;
}

function enabled(formData: FormData, name: string): boolean {
  return formData.get(name) === "on";
}

export async function saveModerationDraft(
  _state: ModerationActionState,
  formData: FormData,
): Promise<ModerationActionState> {
  const session = await requireOwnerSession();
  const parsed = moderationConfigSchema.safeParse({
    actionPoints: {
      ban: Number(formData.get("points-ban")),
      kick: Number(formData.get("points-kick")),
      timeout: Number(formData.get("points-timeout")),
      warn: Number(formData.get("points-warn")),
    },
    defaultTimeoutMinutes: Number(formData.get("defaultTimeoutMinutes")),
    enabled: enabled(formData, "enabled"),
    pointExpiryDays: Number(formData.get("pointExpiryDays")),
    staffRoleIds: formData.getAll("staffRoleIds").map(String),
    thresholds: {
      ban: {
        enabled: enabled(formData, "threshold-ban-enabled"),
        points: Number(formData.get("threshold-ban-points")),
      },
      kick: {
        enabled: enabled(formData, "threshold-kick-enabled"),
        points: Number(formData.get("threshold-kick-points")),
      },
      timeout: {
        enabled: enabled(formData, "threshold-timeout-enabled"),
        points: Number(formData.get("threshold-timeout-points")),
        timeoutMinutes: Number(formData.get("threshold-timeout-minutes")),
      },
    },
  });
  if (!parsed.success) {
    return {
      error:
        "Проверьте баллы, сроки и порядок порогов. Включённые пороги должны возрастать.",
    };
  }

  const database = getDatabase();
  const environment = getDashboardEnvironment();
  const [current] = await database
    .select({ version: max(configurationVersions.version) })
    .from(configurationVersions)
    .where(eq(configurationVersions.module, "moderation"));
  const nextVersion = Number(current?.version ?? 0) + 1;
  await database.transaction(async (transaction) => {
    await transaction
      .update(configurationVersions)
      .set({ status: "superseded", updatedAt: new Date() })
      .where(
        and(
          eq(configurationVersions.module, "moderation"),
          eq(configurationVersions.status, "draft"),
        ),
      );
    await transaction.insert(configurationVersions).values({
      createdBy: session.accountId,
      module: "moderation",
      payload: parsed.data,
      status: "draft",
      version: nextVersion,
    });
    await transaction.insert(auditEvents).values({
      actorId: session.accountId,
      actorType: "owner",
      category: "bot",
      eventType: "configuration.moderation_draft_saved",
      guildId: environment.guildId,
      payload: { version: nextVersion },
    });
  });
  revalidatePath("/moderation");
  return { message: `Черновик версии ${nextVersion} сохранён.` };
}

export async function publishModerationDraft(
  _state: ModerationActionState,
  formData: FormData,
): Promise<ModerationActionState> {
  const session = await requireOwnerSession();
  const parsedVersion = z.coerce
    .number()
    .int()
    .positive()
    .safeParse(formData.get("version"));
  if (!parsedVersion.success) return { error: "Сначала сохраните черновик." };

  const database = getDatabase();
  const environment = getDashboardEnvironment();
  const queued = await database
    .select({ id: configurationVersions.id })
    .from(configurationVersions)
    .where(
      and(
        eq(configurationVersions.module, "moderation"),
        eq(configurationVersions.status, "queued"),
      ),
    )
    .limit(1);
  if (queued.length > 0) {
    return { error: "Предыдущая версия ещё применяется ботом." };
  }

  const updated = await database.transaction(async (transaction) => {
    const rows = await transaction
      .update(configurationVersions)
      .set({ failureReason: null, status: "queued", updatedAt: new Date() })
      .where(
        and(
          eq(configurationVersions.module, "moderation"),
          eq(configurationVersions.version, parsedVersion.data),
          eq(configurationVersions.status, "draft"),
        ),
      )
      .returning({ id: configurationVersions.id });
    if (rows.length === 0) return false;
    await transaction.insert(auditEvents).values({
      actorId: session.accountId,
      actorType: "owner",
      category: "bot",
      eventType: "configuration.moderation_queued",
      guildId: environment.guildId,
      payload: { version: parsedVersion.data },
    });
    return true;
  });
  if (!updated) {
    return { error: "Черновик изменился. Обновите страницу и повторите." };
  }
  revalidatePath("/moderation");
  return { message: `Версия ${parsedVersion.data} передана боту.` };
}
