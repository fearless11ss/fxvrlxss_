import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/postgres-js/migrator";

import { createDatabase } from "./client.js";

const databaseUrl =
  process.env.DATABASE_URL ??
  (process.env.DATABASE_URL_FILE
    ? readFileSync(process.env.DATABASE_URL_FILE, "utf8").trim()
    : undefined);
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL or DATABASE_URL_FILE is required to run migrations",
  );
}

const migrationsFolder = fileURLToPath(
  new URL("../migrations", import.meta.url),
);
const { connection, database } = createDatabase(databaseUrl);

try {
  await migrate(database, { migrationsFolder });
  console.info("Database migrations applied.");
} finally {
  await connection.end();
}
