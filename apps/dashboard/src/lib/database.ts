import "server-only";

import { createDatabase } from "@fxvrlxss/database/client";

import { getDashboardEnvironment } from "./environment";

type DatabaseState = ReturnType<typeof createDatabase>;

const globalDatabase = globalThis as typeof globalThis & {
  fxvrlxssDatabase?: DatabaseState;
};

export function getDatabase(): DatabaseState["database"] {
  if (!globalDatabase.fxvrlxssDatabase) {
    globalDatabase.fxvrlxssDatabase = createDatabase(
      getDashboardEnvironment().databaseUrl,
    );
  }
  return globalDatabase.fxvrlxssDatabase.database;
}
