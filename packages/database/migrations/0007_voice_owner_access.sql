CREATE TABLE "voice_owner_access" (
	"guild_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"subject_id" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "voice_owner_access_pk" PRIMARY KEY("guild_id", "owner_id", "subject_id"),
	CONSTRAINT "voice_owner_access_kind_check" CHECK ("kind" IN ('trusted', 'banned'))
);
--> statement-breakpoint
CREATE INDEX "voice_owner_access_profile_idx" ON "voice_owner_access" USING btree ("guild_id", "owner_id", "kind");
