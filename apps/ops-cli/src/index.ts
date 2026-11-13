import { readFileSync } from "node:fs";

import { z } from "zod";

import { inventoryGuild } from "./inventory.js";
import { reconcileGuildBlueprint } from "./reconcile-blueprint.js";

const environment = z
  .object({
    DISCORD_GUILD_ID: z.string().min(1),
    DISCORD_ENVIRONMENT: z
      .enum(["development", "staging", "production"])
      .default("development"),
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
if (command === "inventory") {
  const inventory = await inventoryGuild(
    discordToken,
    environment.DISCORD_GUILD_ID,
  );
  console.log(JSON.stringify(inventory, null, 2));
} else if (command === "blueprint-plan") {
  const actions = await reconcileGuildBlueprint(
    discordToken,
    environment.DISCORD_GUILD_ID,
    "plan",
  );
  console.log(JSON.stringify(actions, null, 2));
} else if (command === "blueprint-apply") {
  if (environment.DISCORD_ENVIRONMENT !== "staging") {
    throw new Error(
      "blueprint-apply is restricted to DISCORD_ENVIRONMENT=staging",
    );
  }

  const expectedConfirmation = `--confirm=APPLY_BLUEPRINT_${environment.DISCORD_GUILD_ID}`;
  if (!process.argv.includes(expectedConfirmation)) {
    throw new Error(
      `Missing exact confirmation argument: ${expectedConfirmation}`,
    );
  }

  const actions = await reconcileGuildBlueprint(
    discordToken,
    environment.DISCORD_GUILD_ID,
    "apply",
  );
  console.log(JSON.stringify(actions, null, 2));
} else {
  console.error(
    "Usage: npm run dev -w @fxvrlxss/ops-cli -- <inventory|blueprint-plan|blueprint-apply>",
  );
  process.exitCode = 2;
}
