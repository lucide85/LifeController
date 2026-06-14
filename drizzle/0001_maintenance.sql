DO $$ BEGIN
 CREATE TYPE "public"."maintenance_status" AS ENUM('planned', 'done');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."task_source" AS ENUM('user', 'manual', 'web');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "maintenance_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "maintenance_status" DEFAULT 'planned' NOT NULL,
	"due_date" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cost" text,
	"recurrence_months" integer,
	"recurrence_note" text,
	"source" "task_source" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "maintenance_tasks" ADD CONSTRAINT "maintenance_tasks_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "task_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attachments" ADD CONSTRAINT "attachments_task_id_maintenance_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."maintenance_tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "maintenance_tasks_item_idx" ON "maintenance_tasks" USING btree ("item_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "maintenance_tasks_due_idx" ON "maintenance_tasks" USING btree ("due_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "maintenance_tasks_status_idx" ON "maintenance_tasks" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attachments_task_idx" ON "attachments" USING btree ("task_id");
