ALTER TYPE "publication_status" ADD VALUE 'queued' BEFORE 'published';
--> statement-breakpoint
ALTER TYPE "publication_status" ADD VALUE 'failed' AFTER 'published';
--> statement-breakpoint
ALTER TABLE "configuration_versions" ADD COLUMN "failure_reason" text;
