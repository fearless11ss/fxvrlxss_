import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
};

export const publicationStatus = pgEnum("publication_status", [
  "draft",
  "published",
  "superseded",
]);
export const moderationCaseStatus = pgEnum("moderation_case_status", [
  "open",
  "appealed",
  "resolved",
]);
export const ticketStatus = pgEnum("ticket_status", [
  "open",
  "claimed",
  "closed",
  "reopened",
]);

export const configurationVersions = pgTable(
  "configuration_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    module: text("module").notNull(),
    version: integer("version").notNull(),
    status: publicationStatus("status").default("draft").notNull(),
    payload: jsonb("payload").notNull(),
    createdBy: text("created_by").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("configuration_module_version_unique").on(
      table.module,
      table.version,
    ),
    index("configuration_status_idx").on(table.module, table.status),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorId: text("actor_id"),
    actorType: text("actor_type").notNull(),
    category: text("category").notNull(),
    eventType: text("event_type").notNull(),
    guildId: text("guild_id").notNull(),
    severity: text("severity").default("info").notNull(),
    subjectId: text("subject_id"),
    payload: jsonb("payload").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("audit_events_occurred_idx").on(table.occurredAt),
    index("audit_events_subject_idx").on(table.subjectId),
    index("audit_events_type_idx").on(table.category, table.eventType),
  ],
);

export const moderationCases = pgTable(
  "moderation_cases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    status: moderationCaseStatus("status").default("open").notNull(),
    points: integer("points").default(0).notNull(),
    summary: text("summary").notNull(),
    evidence: jsonb("evidence").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("moderation_cases_user_idx").on(table.guildId, table.userId),
    index("moderation_cases_status_idx").on(table.status),
  ],
);

export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull(),
    authorId: text("author_id").notNull(),
    assignedToId: text("assigned_to_id"),
    type: text("type").notNull(),
    status: ticketStatus("status").default("open").notNull(),
    subject: text("subject").notNull(),
    closeReason: text("close_reason"),
    autoCloseDisabled: boolean("auto_close_disabled").default(false).notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("tickets_channel_unique").on(table.channelId),
    index("tickets_author_status_idx").on(table.authorId, table.status),
  ],
);

export const temporaryVoiceRooms = pgTable(
  "temporary_voice_rooms",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull(),
    ownerId: text("owner_id").notNull(),
    locked: boolean("locked").default(false).notNull(),
    hidden: boolean("hidden").default(false).notNull(),
    userLimit: integer("user_limit").default(0).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("temporary_voice_channel_unique").on(table.channelId),
    uniqueIndex("temporary_voice_owner_unique").on(
      table.guildId,
      table.ownerId,
    ),
  ],
);

export const adminAccounts = pgTable("admin_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  encryptedTotpSecret: text("encrypted_totp_secret").notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  ...timestamps,
});

export const adminSessions = pgTable(
  "admin_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .references(() => adminAccounts.id, { onDelete: "cascade" })
      .notNull(),
    tokenHash: text("token_hash").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("admin_session_token_unique").on(table.tokenHash),
    index("admin_session_expiry_idx").on(table.expiresAt),
  ],
);

export const recoveryCodes = pgTable(
  "recovery_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .references(() => adminAccounts.id, { onDelete: "cascade" })
      .notNull(),
    codeHash: text("code_hash").notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("recovery_code_hash_unique").on(table.codeHash)],
);
