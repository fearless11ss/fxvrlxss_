"use server";

import { adminSessions } from "@fxvrlxss/database/schema";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getOwnerSession, SESSION_COOKIE } from "../lib/auth";
import { getDatabase } from "../lib/database";

export async function logoutAction(): Promise<void> {
  const session = await getOwnerSession();
  if (session) {
    await getDatabase()
      .update(adminSessions)
      .set({ revokedAt: new Date() })
      .where(eq(adminSessions.id, session.sessionId));
  }
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
