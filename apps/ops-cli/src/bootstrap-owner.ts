import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { createDatabase } from "@fxvrlxss/database/client";
import { adminAccounts } from "@fxvrlxss/database/schema";
import {
  encryptTotpSecret,
  generateTotpSecret,
  hashPassword,
} from "@fxvrlxss/security/credentials";

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

const usernameArgument = process.argv.find((value) =>
  value.startsWith("--username="),
);
const username =
  usernameArgument?.slice("--username=".length).trim() || "owner";
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
if (encryptionKey.length < 32) {
  throw new Error("AUTH_ENCRYPTION_KEY must contain at least 32 characters");
}

const { connection, database } = createDatabase(databaseUrl);
try {
  const existing = await database
    .select({ id: adminAccounts.id })
    .from(adminAccounts)
    .limit(1);
  if (existing.length > 0) {
    throw new Error("An owner account already exists; bootstrap refused");
  }
  const password = randomBytes(24).toString("base64url");
  const totpSecret = generateTotpSecret();
  await database.insert(adminAccounts).values({
    encryptedTotpSecret: encryptTotpSecret(totpSecret, encryptionKey),
    passwordHash: await hashPassword(password, encryptionKey),
    username,
  });
  const issuer = encodeURIComponent("fxvrlxss_ control");
  const label = encodeURIComponent(`fxvrlxss_:${username}`);
  console.info(`Username: ${username}`);
  console.info(`Password: ${password}`);
  console.info(
    `TOTP URI: otpauth://totp/${label}?secret=${totpSecret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`,
  );
  console.info(
    "Store these values now; the password and TOTP secret are not shown again.",
  );
} finally {
  await connection.end();
}
