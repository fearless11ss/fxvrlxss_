CREATE TYPE "moderation_appeal_status" AS ENUM('none', 'pending', 'approved', 'denied', 'withdrawn');
--> statement-breakpoint
DROP INDEX IF EXISTS "moderation_cases_status_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "moderation_cases_active_points_idx";
--> statement-breakpoint
ALTER TABLE "moderation_cases" RENAME COLUMN "expires_at" TO "points_expire_at";
--> statement-breakpoint
ALTER TABLE "moderation_cases" RENAME COLUMN "resolved_by_id" TO "revoked_by_id";
--> statement-breakpoint
ALTER TABLE "moderation_cases" RENAME COLUMN "resolution_reason" TO "revocation_reason";
--> statement-breakpoint
ALTER TABLE "moderation_cases" RENAME COLUMN "resolved_at" TO "revoked_at";
--> statement-breakpoint
ALTER TABLE "moderation_cases" ADD COLUMN "appeal_status" "moderation_appeal_status" DEFAULT 'none' NOT NULL;
--> statement-breakpoint
ALTER TABLE "moderation_cases" ADD COLUMN "appeal_started_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "moderation_cases" ADD COLUMN "consequence_ends_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "moderation_cases"
SET
  "appeal_status" = CASE
    WHEN "status" = 'appealed' THEN 'pending'::"moderation_appeal_status"
    WHEN "appeal_outcome" = 'approved' THEN 'approved'::"moderation_appeal_status"
    WHEN "appeal_outcome" = 'denied' THEN 'denied'::"moderation_appeal_status"
    WHEN "appeal_outcome" = 'withdrawn' THEN 'withdrawn'::"moderation_appeal_status"
    ELSE 'none'::"moderation_appeal_status"
  END,
  "appeal_started_at" = CASE WHEN "status" = 'appealed' THEN "updated_at" ELSE NULL END,
  "consequence_ends_at" = CASE
    WHEN "applied_action" = 'ban' OR "evidence"->>'automodAction' = 'quarantine' THEN NULL
    WHEN "applied_action" = 'timeout' THEN GREATEST(
      CASE WHEN "points" > 0 THEN "points_expire_at" ELSE "created_at" END,
      "created_at" + COALESCE("timeout_minutes", 0) * interval '1 minute'
    )
    WHEN "points" > 0 THEN "points_expire_at"
    ELSE "created_at"
  END;
--> statement-breakpoint
ALTER TABLE "moderation_cases" DROP COLUMN "status";
--> statement-breakpoint
ALTER TABLE "moderation_cases" DROP COLUMN "appeal_outcome";
--> statement-breakpoint
DROP TYPE "moderation_case_status";
--> statement-breakpoint
CREATE INDEX "moderation_cases_appeal_status_idx" ON "moderation_cases" USING btree ("appeal_status");
--> statement-breakpoint
CREATE INDEX "moderation_cases_consequence_idx" ON "moderation_cases" USING btree ("guild_id", "revoked_at", "consequence_ends_at");
--> statement-breakpoint
CREATE INDEX "moderation_cases_active_points_idx" ON "moderation_cases" USING btree ("guild_id", "user_id", "revoked_at", "points_expire_at");
