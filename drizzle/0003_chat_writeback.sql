-- Phase 2: field-level provenance + non-destructive history for AI write-back.
-- Idempotent (safe to re-run).
DO $$ BEGIN
 CREATE TYPE "public"."fact_source" AS ENUM('manual', 'ai', 'chat', 'web', 'upload');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fact_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"field_key" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"source" "fact_source" DEFAULT 'manual' NOT NULL,
	"source_url" text,
	"source_ref" text,
	"confidence" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fact_revisions" ADD CONSTRAINT "fact_revisions_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fact_revisions_item_idx" ON "fact_revisions" USING btree ("item_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fact_revisions_item_field_idx" ON "fact_revisions" USING btree ("item_id","field_key");
