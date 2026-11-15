"use server";

import { auditEvents, configurationVersions } from "@fxvrlxss/database/schema";
import { automodConfigSchema } from "@fxvrlxss/domain/automod-config";
import { and, eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireOwnerSession } from "../../lib/auth";
import { getDatabase } from "../../lib/database";
import { getDashboardEnvironment } from "../../lib/environment";

export interface SaveAutomodState {
  readonly error?: string;
  readonly message?: string;
}

export interface PublishAutomodState {
  readonly error?: string;
  readonly message?: string;
}

function enabled(formData: FormData, name: string): boolean {
  return formData.get(name) === "on";
}

function numberValue(formData: FormData, name: string): number {
  return Number(formData.get(name));
}

function optionalNumberValue(
  formData: FormData,
  name: string,
): number | undefined {
  const value = formData.get(name);
  return typeof value === "string" && value.length > 0
    ? Number(value)
    : undefined;
}

function idList(formData: FormData, name: string): string[] {
  return formData
    .getAll(name)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function saveAutomodDraft(
  _state: SaveAutomodState,
  formData: FormData,
): Promise<SaveAutomodState> {
  const session = await requireOwnerSession();
  const parsed = automodConfigSchema.safeParse({
    attachmentPolicy: {
      action: formData.get("attachmentAction"),
      allowGif: enabled(formData, "allowGif"),
      allowImages: enabled(formData, "allowImages"),
      allowVideo: enabled(formData, "allowVideo"),
      deleteMessage: enabled(formData, "attachmentDeleteMessage"),
      enabled: enabled(formData, "attachmentEnabled"),
      maximumPerWindow: numberValue(formData, "attachmentMaximumPerWindow"),
      points: optionalNumberValue(formData, "attachmentPoints"),
      timeoutMinutes: optionalNumberValue(formData, "attachmentTimeoutMinutes"),
      windowSeconds: numberValue(formData, "attachmentWindowSeconds"),
    },
    caps: {
      action: formData.get("capsAction"),
      deleteMessage: enabled(formData, "capsDeleteMessage"),
      enabled: enabled(formData, "capsEnabled"),
      minimumLetters: numberValue(formData, "capsMinimumLetters"),
      points: optionalNumberValue(formData, "capsPoints"),
      ratio: numberValue(formData, "capsRatio") / 100,
      timeoutMinutes: optionalNumberValue(formData, "capsTimeoutMinutes"),
    },
    emojiSpam: {
      action: formData.get("emojiAction"),
      deleteMessage: enabled(formData, "emojiDeleteMessage"),
      enabled: enabled(formData, "emojiEnabled"),
      maximum: numberValue(formData, "emojiMaximum"),
      points: optionalNumberValue(formData, "emojiPoints"),
      timeoutMinutes: optionalNumberValue(formData, "emojiTimeoutMinutes"),
    },
    enabled: enabled(formData, "enabled"),
    exemptChannelIds: idList(formData, "exemptChannelIds"),
    exemptRoleIds: idList(formData, "exemptRoleIds"),
    flood: {
      action: formData.get("floodAction"),
      deleteMessage: enabled(formData, "floodDeleteMessage"),
      enabled: enabled(formData, "floodEnabled"),
      maximumMessages: numberValue(formData, "floodMaximumMessages"),
      points: optionalNumberValue(formData, "floodPoints"),
      timeoutMinutes: optionalNumberValue(formData, "floodTimeoutMinutes"),
      windowSeconds: numberValue(formData, "floodWindowSeconds"),
    },
    inviteLinks: {
      action: formData.get("inviteAction"),
      deleteMessage: enabled(formData, "inviteDeleteMessage"),
      enabled: enabled(formData, "inviteEnabled"),
      points: optionalNumberValue(formData, "invitePoints"),
      timeoutMinutes: optionalNumberValue(formData, "inviteTimeoutMinutes"),
    },
    messageLength: {
      action: formData.get("messageLengthAction"),
      deleteMessage: enabled(formData, "messageLengthDeleteMessage"),
      enabled: enabled(formData, "messageLengthEnabled"),
      maximumCharacters: numberValue(formData, "messageLengthMaximum"),
      points: optionalNumberValue(formData, "messageLengthPoints"),
      timeoutMinutes: optionalNumberValue(
        formData,
        "messageLengthTimeoutMinutes",
      ),
    },
    mode: formData.get("mode"),
    repeatedMessages: {
      action: formData.get("repeatedAction"),
      deleteMessage: enabled(formData, "repeatedDeleteMessage"),
      enabled: enabled(formData, "repeatedEnabled"),
      maximumRepeats: numberValue(formData, "repeatedMaximumRepeats"),
      points: optionalNumberValue(formData, "repeatedPoints"),
      timeoutMinutes: optionalNumberValue(formData, "repeatedTimeoutMinutes"),
      windowSeconds: numberValue(formData, "repeatedWindowSeconds"),
    },
  });
  if (!parsed.success) {
    return { error: "Проверьте пороги и выбранные действия." };
  }

  const database = getDatabase();
  const environment = getDashboardEnvironment();
  const [current] = await database
    .select({ version: max(configurationVersions.version) })
    .from(configurationVersions)
    .where(eq(configurationVersions.module, "automod"));
  const nextVersion = Number(current?.version ?? 0) + 1;
  await database.transaction(async (transaction) => {
    await transaction
      .update(configurationVersions)
      .set({ status: "superseded", updatedAt: new Date() })
      .where(
        and(
          eq(configurationVersions.module, "automod"),
          eq(configurationVersions.status, "draft"),
        ),
      );
    await transaction.insert(configurationVersions).values({
      createdBy: session.accountId,
      module: "automod",
      payload: parsed.data,
      status: "draft",
      version: nextVersion,
    });
    await transaction.insert(auditEvents).values({
      actorId: session.accountId,
      actorType: "owner",
      category: "bot",
      eventType: "configuration.automod_draft_saved",
      guildId: environment.guildId,
      payload: { version: nextVersion },
    });
  });
  revalidatePath("/automod");
  return { message: `Черновик версии ${nextVersion} сохранён.` };
}

export async function publishAutomodDraft(
  _state: PublishAutomodState,
  formData: FormData,
): Promise<PublishAutomodState> {
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
        eq(configurationVersions.module, "automod"),
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
          eq(configurationVersions.module, "automod"),
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
      eventType: "configuration.automod_queued",
      guildId: environment.guildId,
      payload: { version: parsedVersion.data },
    });
    return true;
  });
  if (!updated) {
    return { error: "Черновик изменился. Обновите страницу и повторите." };
  }
  revalidatePath("/automod");
  return { message: `Версия ${parsedVersion.data} передана боту.` };
}
