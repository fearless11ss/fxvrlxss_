"use server";

import { auditEvents, configurationVersions } from "@fxvrlxss/database/schema";
import { automodConfigSchema } from "@fxvrlxss/domain/automod-config";
import { and, eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireOwnerSession } from "../../lib/auth";
import { getDatabase } from "../../lib/database";
import { getDashboardEnvironment } from "../../lib/environment";

export interface SaveAutomodState {
  readonly error?: string;
  readonly message?: string;
}

function enabled(formData: FormData, name: string): boolean {
  return formData.get(name) === "on";
}

function numberValue(formData: FormData, name: string): number {
  return Number(formData.get(name));
}

function idList(formData: FormData, name: string): string[] {
  const value = formData.get(name);
  if (typeof value !== "string") return [];
  return value
    .split(/[\s,]+/)
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
      enabled: enabled(formData, "attachmentEnabled"),
    },
    caps: {
      action: formData.get("capsAction"),
      enabled: enabled(formData, "capsEnabled"),
      minimumLetters: numberValue(formData, "capsMinimumLetters"),
      ratio: numberValue(formData, "capsRatio") / 100,
    },
    emojiSpam: {
      action: formData.get("emojiAction"),
      enabled: enabled(formData, "emojiEnabled"),
      maximum: numberValue(formData, "emojiMaximum"),
    },
    enabled: enabled(formData, "enabled"),
    exemptChannelIds: idList(formData, "exemptChannelIds"),
    exemptRoleIds: idList(formData, "exemptRoleIds"),
    flood: {
      action: formData.get("floodAction"),
      enabled: enabled(formData, "floodEnabled"),
      maximumMessages: numberValue(formData, "floodMaximumMessages"),
      windowSeconds: numberValue(formData, "floodWindowSeconds"),
    },
    inviteLinks: {
      action: formData.get("inviteAction"),
      enabled: enabled(formData, "inviteEnabled"),
    },
    mode: formData.get("mode"),
    repeatedMessages: {
      action: formData.get("repeatedAction"),
      enabled: enabled(formData, "repeatedEnabled"),
      maximumRepeats: numberValue(formData, "repeatedMaximumRepeats"),
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
