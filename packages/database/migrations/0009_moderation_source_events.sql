ALTER TABLE "moderation_cases" ADD COLUMN "source_event_key" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "moderation_cases_source_event_unique" ON "moderation_cases" USING btree ("guild_id", "source_event_key");
