import "server-only";

import { readFileSync } from "node:fs";

import { z } from "zod";

const schema = z.object({
  AUTH_COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  AUTH_ENCRYPTION_KEY: z.string().min(32).optional(),
  AUTH_ENCRYPTION_KEY_FILE: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1).optional(),
  DATABASE_URL_FILE: z.string().min(1).optional(),
  DISCORD_GUILD_ID: z.string().min(1),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(12),
});

export interface DashboardEnvironment {
  readonly authEncryptionKey: string;
  readonly cookieSecure: boolean;
  readonly databaseUrl: string;
  readonly guildId: string;
  readonly production: boolean;
  readonly sessionTtlHours: number;
}

let cached: DashboardEnvironment | undefined;

function secret(
  value: string | undefined,
  file: string | undefined,
  name: string,
) {
  const resolved =
    value ?? (file ? readFileSync(file, "utf8").trim() : undefined);
  if (!resolved) throw new Error(`${name} or ${name}_FILE is required`);
  return resolved;
}

export function getDashboardEnvironment(): DashboardEnvironment {
  if (cached) return cached;
  const parsed = schema.parse(process.env);
  const authEncryptionKey = secret(
    parsed.AUTH_ENCRYPTION_KEY,
    parsed.AUTH_ENCRYPTION_KEY_FILE,
    "AUTH_ENCRYPTION_KEY",
  );
  if (authEncryptionKey.length < 32) {
    throw new Error("AUTH_ENCRYPTION_KEY must contain at least 32 characters");
  }
  cached = {
    authEncryptionKey,
    cookieSecure: parsed.AUTH_COOKIE_SECURE,
    databaseUrl: secret(
      parsed.DATABASE_URL,
      parsed.DATABASE_URL_FILE,
      "DATABASE_URL",
    ),
    guildId: parsed.DISCORD_GUILD_ID,
    production: parsed.NODE_ENV === "production",
    sessionTtlHours: parsed.SESSION_TTL_HOURS,
  };
  return cached;
}
