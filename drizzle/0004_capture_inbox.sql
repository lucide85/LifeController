-- Phase 3: Capture Inbox (drop-and-structure) + URL dedup. Idempotent.
DO $$ BEGIN
 CREATE TYPE "public"."capture_status" AS ENUM('inbox', 'filed', 'discarded');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."capture_kind" AS ENUM('text', 'url', 'file');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "captures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"status" "capture_status" DEFAULT 'inbox' NOT NULL,
	"kind" "capture_kind" DEFAULT 'text' NOT NULL,
	"raw_text" text,
	"source_url" text,
	"source_title" text,
	"file_name" text,
	"mime_type" text,
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"storage_key" text,
	"image_url" text,
	"extracted_text" text,
	"embedding" vector(1024),
	"suggested_action" jsonb,
	"filed_item_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "captures" ADD CONSTRAINT "captures_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "canonical_url" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "captures_owner_idx" ON "captures" USING btree ("owner_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "captures_status_idx" ON "captures" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "captures_embedding_idx" ON "captures" USING hnsw ("embedding" vector_cosine_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attachments_canonical_url_idx" ON "attachments" USING btree ("canonical_url");
