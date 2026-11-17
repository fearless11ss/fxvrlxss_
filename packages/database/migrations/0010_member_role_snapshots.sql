ALTER TABLE "discord_resource_catalog" ADD COLUMN "role_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
