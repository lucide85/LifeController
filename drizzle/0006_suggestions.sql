-- 0006_suggestions.sql — proactive cross-item suggestions (duplicate / link / field-gap).
-- A periodic scan proposes likely duplicates, candidate links and fillable spec-field
-- gaps; the owner accepts or dismisses each. `dedupe_key` (unique per owner) stops the
-- scan re-proposing something already accepted or dismissed. Idempotent (safe to re-run).

DO $$ BEGIN
 CREATE TYPE "public"."suggestion_kind" AS ENUM('duplicate', 'link', 'field_gap');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
 CREATE TYPE "public"."suggestion_status" AS ENUM('pending', 'accepted', 'dismissed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "suggestions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" uuid NOT NULL,
  "kind" "suggestion_kind" NOT NULL,
  "status" "suggestion_status" DEFAULT 'pending' NOT NULL,
  "item_id" uuid NOT NULL,
  "related_item_id" uuid,
  "relation" text,
  "field_key" text,
  "proposed_value" text,
  "title" text,
  "detail" text,
  "source_url" text,
  "confidence" real,
  "dedupe_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone
);

DO $$ BEGIN
 ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
 ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
 ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_related_item_id_items_id_fk" FOREIGN KEY ("related_item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "suggestions_owner_idx" ON "suggestions" USING btree ("owner_id");
CREATE INDEX IF NOT EXISTS "suggestions_status_idx" ON "suggestions" USING btree ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "suggestions_dedupe_idx" ON "suggestions" USING btree ("owner_id","dedupe_key");
