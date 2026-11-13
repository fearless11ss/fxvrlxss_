CREATE TABLE "blocked_ip_addresses" (
  "ip_hash" text PRIMARY KEY NOT NULL,
  "reason" text NOT NULL,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ip_hash" text NOT NULL,
  "username" text NOT NULL,
  "successful" boolean DEFAULT false NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "login_attempts_ip_time_idx" ON "login_attempts" USING btree ("ip_hash", "occurred_at");
