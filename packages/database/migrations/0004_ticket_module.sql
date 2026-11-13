ALTER TABLE "tickets" ADD COLUMN "number" serial NOT NULL;
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "description" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "control_message_id" text;
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "participant_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "transcript" jsonb;
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "claimed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "reopened_at" timestamp with time zone;
--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_number_unique" ON "tickets" USING btree ("number");
--> statement-breakpoint
CREATE INDEX "tickets_status_activity_idx" ON "tickets" USING btree ("guild_id","status","updated_at");
