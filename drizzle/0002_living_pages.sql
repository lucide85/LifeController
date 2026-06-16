-- Phase 1: living pages. AI-distilled front-page summary + adaptive layout.
-- Idempotent (safe to re-run): IF NOT EXISTS on every column.
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "summary_md" text;
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "summary_at_a_glance" text;
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "summary_updated_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "layout" text DEFAULT 'generic' NOT NULL;
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "fields_meta" jsonb DEFAULT '{}'::jsonb;
