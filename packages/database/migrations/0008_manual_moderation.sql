ALTER TABLE "moderation_cases" ADD COLUMN "number" serial NOT NULL;
--> statement-breakpoint
ALTER TABLE "moderation_cases" ADD COLUMN "moderator_id" text DEFAULT 'legacy' NOT NULL;
--> statement-breakpoint
ALTER TABLE "moderation_cases" ADD COLUMN "requested_action" text DEFAULT 'warn' NOT NULL;
--> statement-breakpoint
ALTER TABLE "moderation_cases" ADD COLUMN "applied_action" text DEFAULT 'warn' NOT NULL;
--> statement-breakpoint
ALTER TABLE "moderation_cases" ADD COLUMN "timeout_minutes" integer;
--> statement-breakpoint
ALTER TABLE "moderation_cases" ADD COLUMN "appeal_outcome" text;
--> statement-breakpoint
ALTER TABLE "moderation_cases" ADD COLUMN "appeal_reason" text;
--> statement-breakpoint
ALTER TABLE "moderation_cases" ADD COLUMN "appeal_resolved_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "moderation_cases" ADD COLUMN "appeal_resolved_by_id" text;
--> statement-breakpoint
ALTER TABLE "moderation_cases" ADD COLUMN "resolved_by_id" text;
--> statement-breakpoint
ALTER TABLE "moderation_cases" ADD COLUMN "resolution_reason" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "moderation_cases_number_unique" ON "moderation_cases" USING btree ("number");
--> statement-breakpoint
CREATE INDEX "moderation_cases_active_points_idx" ON "moderation_cases" USING btree ("guild_id", "user_id", "status", "expires_at");
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "moderation_case_number" integer;
