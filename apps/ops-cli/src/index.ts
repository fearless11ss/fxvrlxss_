import { readFileSync } from "node:fs";

import { z } from "zod";

import { inventoryGuild } from "./inventory.js";

const environment = z
  .object({
    DISCORD_GUILD_ID: z.string().min(1),
    DISCORD_TOKEN: z.string().min(1).optional(),
    DISCORD_TOKEN_FILE: z.string().min(1).optional(),
  })
  .parse(process.env);

const discordToken =
  environment.DISCORD_TOKEN ??
  (environment.DISCORD_TOKEN_FILE
    ? readFileSync(environment.DISCORD_TOKEN_FILE, "utf8").trim()
    : undefined);
if (!discordToken) {
  throw new Error("DISCORD_TOKEN or DISCORD_TOKEN_FILE is required");
}

const command = process.argv[2];
if (command !== "inventory") {
  console.error("Usage: npm run dev -w @fxvrlxss/ops-cli -- inventory");
  process.exitCode = 2;
} else {
  const inventory = await inventoryGuild(
    discordToken,
    environment.DISCORD_GUILD_ID,
  );
  console.log(JSON.stringify(inventory, null, 2));
}
