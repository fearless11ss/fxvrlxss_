"use server";

import {
  adminAccounts,
  adminSessions,
  auditEvents,
  blockedIpAddresses,
  loginAttempts,
} from "@fxvrlxss/database/schema";
import {
  createIpHash,
  createSessionToken,
  decryptTotpSecret,
  verifyPassword,
  verifyTotp,
} from "@fxvrlxss/security/credentials";
import { and, count, eq, gte, gt, isNull, or } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { SESSION_COOKIE } from "../../lib/auth";
import { getDatabase } from "../../lib/database";
import { getDashboardEnvironment } from "../../lib/environment";

const loginSchema = z.object({
  password: z.string().min(1).max(256),
  token: z.string().regex(/^\d{6}$/),
  username: z.string().trim().min(1).max(128),
});

const DUMMY_HASH = `scrypt-v1$131072$8$1$${Buffer.alloc(16).toString("base64url")}$${Buffer.alloc(64).toString("base64url")}`;
const FAILURE_WINDOW_MS = 15 * 60 * 1_000;
const PERMANENT_BAN_THRESHOLD = 10;

export interface LoginState {
  readonly error?: string;
}

async function clientIp(): Promise<string> {
  const requestHeaders = await headers();
  return (
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    requestHeaders.get("x-real-ip") ??
    "unknown"
  );
}

export async function loginAction(
  _state: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    password: formData.get("password"),
    token: formData.get("token"),
    username: formData.get("username"),
  });
  if (!parsed.success) return { error: "Проверьте введённые данные." };

  const environment = getDashboardEnvironment();
  const database = getDatabase();
  const ip = await clientIp();
  const ipHash = createIpHash(ip, environment.authEncryptionKey);
  const now = new Date();
  const blocked = await database
    .select({ ipHash: blockedIpAddresses.ipHash })
    .from(blockedIpAddresses)
    .where(
      and(
        eq(blockedIpAddresses.ipHash, ipHash),
        or(
          isNull(blockedIpAddresses.expiresAt),
          gt(blockedIpAddresses.expiresAt, now),
        ),
      ),
    )
    .limit(1);
  if (blocked.length > 0) return { error: "Вход с этого адреса заблокирован." };

  const accounts = await database
    .select()
    .from(adminAccounts)
    .where(eq(adminAccounts.username, parsed.data.username))
    .limit(1);
  const account = accounts[0];
  const passwordValid = await verifyPassword(
    parsed.data.password,
    account?.passwordHash ?? DUMMY_HASH,
    environment.authEncryptionKey,
  );
  const totpValid = account
    ? verifyTotp(
        parsed.data.token,
        decryptTotpSecret(
          account.encryptedTotpSecret,
          environment.authEncryptionKey,
        ),
      )
    : false;
  const valid = Boolean(account?.enabled && passwordValid && totpValid);

  if (!valid || !account) {
    const cutoff = new Date(now.getTime() - FAILURE_WINDOW_MS);
    const [recent] = await database
      .select({ value: count() })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.ipHash, ipHash),
          eq(loginAttempts.successful, false),
          gte(loginAttempts.occurredAt, cutoff),
        ),
      );
    const failureCount = Number(recent?.value ?? 0) + 1;
    await database.transaction(async (transaction) => {
      await transaction.insert(loginAttempts).values({
        ipHash,
        successful: false,
        username: parsed.data.username,
      });
      await transaction.insert(auditEvents).values({
        actorType: "authentication",
        category: "security",
        eventType: "dashboard.login_failed",
        guildId: environment.guildId,
        payload: { failureCount, ipHash, username: parsed.data.username },
        severity: "warning",
      });
      if (
        environment.production &&
        ip !== "unknown" &&
        failureCount >= PERMANENT_BAN_THRESHOLD
      ) {
        await transaction
          .insert(blockedIpAddresses)
          .values({
            ipHash,
            reason: `${PERMANENT_BAN_THRESHOLD} failed logins in 15 minutes`,
          })
          .onConflictDoNothing();
      }
    });
    return { error: "Неверный логин, пароль или одноразовый код." };
  }

  const session = createSessionToken();
  const expiresAt = new Date(
    now.getTime() + environment.sessionTtlHours * 60 * 60 * 1_000,
  );
  await database.transaction(async (transaction) => {
    await transaction.insert(adminSessions).values({
      accountId: account.id,
      expiresAt,
      tokenHash: session.hash,
    });
    await transaction.insert(loginAttempts).values({
      ipHash,
      successful: true,
      username: account.username,
    });
    await transaction.insert(auditEvents).values({
      actorId: account.id,
      actorType: "owner",
      category: "security",
      eventType: "dashboard.login_succeeded",
      guildId: environment.guildId,
      payload: { ipHash },
    });
  });
  (await cookies()).set(SESSION_COOKIE, session.raw, {
    expires: expiresAt,
    httpOnly: true,
    path: "/",
    sameSite: "strict",
    secure: environment.cookieSecure,
  });
  redirect("/");
}
