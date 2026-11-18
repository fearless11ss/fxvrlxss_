"use server";

import { auditEvents, configurationVersions } from "@fxvrlxss/database/schema";
import {
  supportTicketTypeKeys,
  ticketConfigSchema,
} from "@fxvrlxss/domain/ticket-config";
import { and, eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireOwnerSession } from "../../lib/auth";
import { getDatabase } from "../../lib/database";
import { getDashboardEnvironment } from "../../lib/environment";

export interface SaveTicketState {
  readonly error?: string;
  readonly message?: string;
}

export interface PublishTicketState {
  readonly error?: string;
  readonly message?: string;
}

function enabled(formData: FormData, name: string): boolean {
  return formData.get(name) === "on";
}

function idList(formData: FormData, name: string): string[] {
  return formData
    .getAll(name)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function saveTicketDraft(
  _state: SaveTicketState,
  formData: FormData,
): Promise<SaveTicketState> {
  const session = await requireOwnerSession();
  const parsed = ticketConfigSchema.safeParse({
    allowReopen: enabled(formData, "allowReopen"),
    autoCloseHours: Number(formData.get("autoCloseHours")),
    enabled: enabled(formData, "enabled"),
    maxOpenTicketsPerUser: Number(formData.get("maxOpenTicketsPerUser")),
    panelDescription: formData.get("panelDescription"),
    panelTitle: formData.get("panelTitle"),
    staffRoleIds: idList(formData, "staffRoleIds"),
    transcriptEnabled: enabled(formData, "transcriptEnabled"),
    types: supportTicketTypeKeys.map((key) => ({
      description: formData.get(`type-${key}-description`),
      enabled: enabled(formData, `type-${key}-enabled`),
      key,
      label: formData.get(`type-${key}-label`),
    })),
  });
  if (!parsed.success) {
    return {
      error: "Проверьте названия, описания, лимиты и выбранные роли команды.",
    };
  }

  const database = getDatabase();
  const environment = getDashboardEnvironment();
  const [current] = await database
    .select({ version: max(configurationVersions.version) })
    .from(configurationVersions)
    .where(eq(configurationVersions.module, "tickets"));
  const nextVersion = Number(current?.version ?? 0) + 1;
  await database.transaction(async (transaction) => {
    await transaction
      .update(configurationVersions)
      .set({ status: "superseded", updatedAt: new Date() })
      .where(
        and(
          eq(configurationVersions.module, "tickets"),
          eq(configurationVersions.status, "draft"),
        ),
      );
    await transaction.insert(configurationVersions).values({
      createdBy: session.accountId,
      module: "tickets",
      payload: parsed.data,
      status: "draft",
      version: nextVersion,
    });
    await transaction.insert(auditEvents).values({
      actorId: session.accountId,
      actorType: "owner",
      category: "bot",
      eventType: "configuration.tickets_draft_saved",
      guildId: environment.guildId,
      payload: { version: nextVersion },
    });
  });
  revalidatePath("/tickets");
  return { message: `Черновик версии ${nextVersion} сохранён.` };
}

export async function publishTicketDraft(
  _state: PublishTicketState,
  formData: FormData,
): Promise<PublishTicketState> {
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
        eq(configurationVersions.module, "tickets"),
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
          eq(configurationVersions.module, "tickets"),
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
      eventType: "configuration.tickets_queued",
      guildId: environment.guildId,
      payload: { version: parsedVersion.data },
    });
    return true;
  });
  if (!updated) {
    return { error: "Черновик изменился. Обновите страницу и повторите." };
  }
  revalidatePath("/tickets");
  return { message: `Версия ${parsedVersion.data} передана боту.` };
}
