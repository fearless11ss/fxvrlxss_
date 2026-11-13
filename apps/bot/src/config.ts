import { readFileSync } from "node:fs";

import { z } from "zod";

const environmentSchema = z.object({
  DISCORD_GUILD_ID: z.string().min(1),
  DISCORD_TOKEN: z.string().min(1).optional(),
  DISCORD_TOKEN_FILE: z.string().min(1).optional(),
  HEALTH_PORT: z.coerce.number().int().min(1).max(65_535).default(3011),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export type BotConfig = z.infer<typeof environmentSchema>;

export type ResolvedBotConfig = Omit<
  BotConfig,
  "DISCORD_TOKEN" | "DISCORD_TOKEN_FILE"
> & {
  readonly DISCORD_TOKEN: string;
};

function resolveSecret(
  value: string | undefined,
  file: string | undefined,
): string {
  if (value) return value;
  if (file) return readFileSync(file, "utf8").trim();
  throw new Error("DISCORD_TOKEN or DISCORD_TOKEN_FILE is required");
}

export function loadBotConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ResolvedBotConfig {
  const parsed = environmentSchema.parse(environment);
  const { DISCORD_TOKEN_FILE, ...config } = parsed;
  return {
    ...config,
    DISCORD_TOKEN: resolveSecret(parsed.DISCORD_TOKEN, DISCORD_TOKEN_FILE),
  };
}
