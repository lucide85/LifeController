-- Phase 4: hero/cover image + confirmable cross-item links. Idempotent.
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "hero_attachment_id" uuid;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "item_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"from_item_id" uuid NOT NULL,
	"to_item_id" uuid NOT NULL,
	"relation" text DEFAULT 'related' NOT NULL,
	"origin" text DEFAULT 'user' NOT NULL,
	"confidence" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "item_links" ADD CONSTRAINT "item_links_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "item_links" ADD CONSTRAINT "item_links_from_item_id_items_id_fk" FOREIGN KEY ("from_item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "item_links" ADD CONSTRAINT "item_links_to_item_id_items_id_fk" FOREIGN KEY ("to_item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "item_links_unique_idx" ON "item_links" USING btree ("from_item_id","to_item_id","relation");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "item_links_from_idx" ON "item_links" USING btree ("from_item_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "item_links_to_idx" ON "item_links" USING btree ("to_item_id");
