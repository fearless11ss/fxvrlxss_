CREATE TABLE "discord_resource_catalog" (
  "guild_id" text NOT NULL,
  "kind" text NOT NULL,
  "resource_id" text NOT NULL,
  "name" text NOT NULL,
  "parent_name" text,
  "position" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "discord_resource_catalog_guild_id_kind_resource_id_pk" PRIMARY KEY("guild_id","kind","resource_id")
);
--> statement-breakpoint
CREATE INDEX "discord_resource_catalog_kind_idx" ON "discord_resource_catalog" USING btree ("guild_id","kind");
