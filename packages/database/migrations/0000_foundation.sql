CREATE TYPE "publication_status" AS ENUM ('draft', 'published', 'superseded');
--> statement-breakpoint
CREATE TYPE "moderation_case_status" AS ENUM ('open', 'appealed', 'resolved');
--> statement-breakpoint
CREATE TYPE "ticket_status" AS ENUM ('open', 'claimed', 'closed', 'reopened');
--> statement-breakpoint
CREATE TABLE "configuration_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "module" text NOT NULL,
  "version" integer NOT NULL,
  "status" "publication_status" DEFAULT 'draft' NOT NULL,
  "payload" jsonb NOT NULL,
  "created_by" text NOT NULL,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_id" text,
  "actor_type" text NOT NULL,
  "category" text NOT NULL,
  "event_type" text NOT NULL,
  "guild_id" text NOT NULL,
  "severity" text DEFAULT 'info' NOT NULL,
  "subject_id" text,
  "payload" jsonb NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_cases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "guild_id" text NOT NULL,
  "user_id" text NOT NULL,
  "status" "moderation_case_status" DEFAULT 'open' NOT NULL,
  "points" integer DEFAULT 0 NOT NULL,
  "summary" text NOT NULL,
  "evidence" jsonb NOT NULL,
  "expires_at" timestamp with time zone,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "guild_id" text NOT NULL,
  "channel_id" text NOT NULL,
  "author_id" text NOT NULL,
  "assigned_to_id" text,
  "type" text NOT NULL,
  "status" "ticket_status" DEFAULT 'open' NOT NULL,
  "subject" text NOT NULL,
  "close_reason" text,
  "auto_close_disabled" boolean DEFAULT false NOT NULL,
  "closed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "temporary_voice_rooms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "guild_id" text NOT NULL,
  "channel_id" text NOT NULL,
  "owner_id" text NOT NULL,
  "locked" boolean DEFAULT false NOT NULL,
  "hidden" boolean DEFAULT false NOT NULL,
  "user_limit" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "username" text NOT NULL,
  "password_hash" text NOT NULL,
  "encrypted_totp_secret" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "admin_accounts_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "admin_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "token_hash" text NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recovery_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "code_hash" text NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_account_id_admin_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."admin_accounts"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_account_id_admin_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."admin_accounts"("id") ON DELETE cascade;
--> statement-breakpoint
CREATE UNIQUE INDEX "configuration_module_version_unique" ON "configuration_versions" USING btree ("module", "version");
CREATE INDEX "configuration_status_idx" ON "configuration_versions" USING btree ("module", "status");
CREATE INDEX "audit_events_occurred_idx" ON "audit_events" USING btree ("occurred_at");
CREATE INDEX "audit_events_subject_idx" ON "audit_events" USING btree ("subject_id");
CREATE INDEX "audit_events_type_idx" ON "audit_events" USING btree ("category", "event_type");
CREATE INDEX "moderation_cases_user_idx" ON "moderation_cases" USING btree ("guild_id", "user_id");
CREATE INDEX "moderation_cases_status_idx" ON "moderation_cases" USING btree ("status");
CREATE UNIQUE INDEX "tickets_channel_unique" ON "tickets" USING btree ("channel_id");
CREATE INDEX "tickets_author_status_idx" ON "tickets" USING btree ("author_id", "status");
CREATE UNIQUE INDEX "temporary_voice_channel_unique" ON "temporary_voice_rooms" USING btree ("channel_id");
CREATE UNIQUE INDEX "temporary_voice_owner_unique" ON "temporary_voice_rooms" USING btree ("guild_id", "owner_id");
CREATE UNIQUE INDEX "admin_session_token_unique" ON "admin_sessions" USING btree ("token_hash");
CREATE INDEX "admin_session_expiry_idx" ON "admin_sessions" USING btree ("expires_at");
CREATE UNIQUE INDEX "recovery_code_hash_unique" ON "recovery_codes" USING btree ("code_hash");
