import * as schema from "@fxvrlxss/database/schema";
import { drizzle } from "drizzle-orm/postgres-js";
import { describe, expect, it } from "vitest";

import { buildAuditStatsQuery } from "./queries.js";

describe("audit journal queries", () => {
  it("encodes the rolling-day boundary as a PostgreSQL timestamp", () => {
    const database = drizzle.mock({ schema });
    const since = new Date("2026-11-16T12:00:00.000Z");
    const query = buildAuditStatsQuery(database, "guild-1", since).toSQL();

    expect(query.params[0]).toBe("2026-11-16T12:00:00.000Z");
  });
});
