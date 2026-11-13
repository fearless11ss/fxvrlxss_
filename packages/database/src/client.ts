import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema.js";

export function createDatabase(databaseUrl: string) {
  const connection = postgres(databaseUrl, {
    max: 10,
    prepare: false,
  });
  return {
    connection,
    database: drizzle(connection, { schema }),
  };
}

export type Database = ReturnType<typeof createDatabase>["database"];
