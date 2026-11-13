import "server-only";

import { adminAccounts, adminSessions } from "@fxvrlxss/database/schema";
import { hashSessionToken } from "@fxvrlxss/security/credentials";
import { and, eq, gt, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { getDatabase } from "./database";

export const SESSION_COOKIE = "fxvrlxss_session";

export interface OwnerSession {
  readonly accountId: string;
  readonly sessionId: string;
  readonly username: string;
}

export const getOwnerSession = cache(async (): Promise<OwnerSession | null> => {
  const rawToken = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!rawToken) return null;
  const database = getDatabase();
  const rows = await database
    .select({
      accountId: adminAccounts.id,
      enabled: adminAccounts.enabled,
      sessionId: adminSessions.id,
      username: adminAccounts.username,
    })
    .from(adminSessions)
    .innerJoin(adminAccounts, eq(adminSessions.accountId, adminAccounts.id))
    .where(
      and(
        eq(adminSessions.tokenHash, hashSessionToken(rawToken)),
        gt(adminSessions.expiresAt, new Date()),
        isNull(adminSessions.revokedAt),
      ),
    )
    .limit(1);
  const session = rows[0];
  if (!session?.enabled) return null;
  return {
    accountId: session.accountId,
    sessionId: session.sessionId,
    username: session.username,
  };
});

export async function requireOwnerSession(): Promise<OwnerSession> {
  const session = await getOwnerSession();
  if (!session) redirect("/login");
  return session;
}
