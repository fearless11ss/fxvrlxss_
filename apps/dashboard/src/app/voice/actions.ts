"use server";

import { auditEvents, configurationVersions } from "@fxvrlxss/database/schema";
import { voiceConfigSchema } from "@fxvrlxss/domain/voice-config";
import { and, eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireOwnerSession } from "../../lib/auth";
import { getDatabase } from "../../lib/database";
import { getDashboardEnvironment } from "../../lib/environment";

export interface VoiceActionState {
  readonly error?: string;
  readonly message?: string;
}

function enabled(formData: FormData, name: string): boolean {
  return formData.get(name) === "on";
}

export async function saveVoiceDraft(
  _state: VoiceActionState,
  formData: FormData,
): Promise<VoiceActionState> {
  const session = await requireOwnerSession();
  const parsed = voiceConfigSchema.safeParse({
    controls: {
      allowHide: enabled(formData, "allowHide"),
      allowLock: enabled(formData, "allowLock"),
      allowMemberManagement: enabled(formData, "allowMemberManagement"),
      allowOwnershipTransfer: enabled(formData, "allowOwnershipTransfer"),
      allowRename: enabled(formData, "allowRename"),
      allowUserLimit: enabled(formData, "allowUserLimit"),
    },
    defaultUserLimit: Number(formData.get("defaultUserLimit")),
    enabled: enabled(formData, "enabled"),
    panelDescription: formData.get("panelDescription"),
    panelTitle: formData.get("panelTitle"),
    roomNameTemplate: formData.get("roomNameTemplate"),
  });
  if (!parsed.success) {
    return {
      error:
        "Проверьте тексты, лимит и шаблон названия. В шаблоне должен быть {name}.",
    };
  }

  const database = getDatabase();
  const environment = getDashboardEnvironment();
  const [current] = await database
    .select({ version: max(configurationVersions.version) })
    .from(configurationVersions)
    .where(eq(configurationVersions.module, "voice"));
  const nextVersion = Number(current?.version ?? 0) + 1;
  await database.transaction(async (transaction) => {
    await transaction
      .update(configurationVersions)
      .set({ status: "superseded", updatedAt: new Date() })
      .where(
        and(
          eq(configurationVersions.module, "voice"),
          eq(configurationVersions.status, "draft"),
        ),
      );
    await transaction.insert(configurationVersions).values({
      createdBy: session.accountId,
      module: "voice",
      payload: parsed.data,
      status: "draft",
      version: nextVersion,
    });
    await transaction.insert(auditEvents).values({
      actorId: session.accountId,
      actorType: "owner",
      category: "bot",
      eventType: "configuration.voice_draft_saved",
      guildId: environment.guildId,
      payload: { version: nextVersion },
    });
  });
  revalidatePath("/voice");
  return { message: `Черновик версии ${nextVersion} сохранён.` };
}

export async function publishVoiceDraft(
  _state: VoiceActionState,
  formData: FormData,
): Promise<VoiceActionState> {
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
        eq(configurationVersions.module, "voice"),
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
          eq(configurationVersions.module, "voice"),
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
      eventType: "configuration.voice_queued",
      guildId: environment.guildId,
      payload: { version: parsedVersion.data },
    });
    return true;
  });
  if (!updated) {
    return { error: "Черновик изменился. Обновите страницу и повторите." };
  }
  revalidatePath("/voice");
  return { message: `Версия ${parsedVersion.data} передана боту.` };
}
