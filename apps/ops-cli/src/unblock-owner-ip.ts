import { readFileSync } from "node:fs";

import { createDatabase } from "@fxvrlxss/database/client";
import { blockedIpAddresses } from "@fxvrlxss/database/schema";
import { createIpHash } from "@fxvrlxss/security/credentials";
import { eq } from "drizzle-orm";

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

const ipArgument = process.argv.find((value) => value.startsWith("--ip="));
const ip = ipArgument?.slice("--ip=".length).trim();
if (!ip) throw new Error("Pass the exact blocked address as --ip=<address>");

const databaseUrl = secret(
  process.env.DATABASE_URL,
  process.env.DATABASE_URL_FILE,
  "DATABASE_URL",
);
const encryptionKey = secret(
  process.env.AUTH_ENCRYPTION_KEY,
  process.env.AUTH_ENCRYPTION_KEY_FILE,
  "AUTH_ENCRYPTION_KEY",
);

const { connection, database } = createDatabase(databaseUrl);
try {
  const removed = await database
    .delete(blockedIpAddresses)
    .where(eq(blockedIpAddresses.ipHash, createIpHash(ip, encryptionKey)))
    .returning({ ipHash: blockedIpAddresses.ipHash });
  console.info(
    removed.length === 1
      ? `Removed the permanent block for ${ip}.`
      : `No permanent block was found for ${ip}.`,
  );
} finally {
  await connection.end();
}
