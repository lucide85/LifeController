import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  pgEnum,
  index,
  vector,
  bigint,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Embedding dimension. voyage-3-large = 1024. If you switch models, update this
// AND regenerate/migrate the DB (the vector column dimension is fixed).
export const EMBEDDING_DIM = 1024;

// ── Enums ─────────────────────────────────────────────────────────────────────
export const userStatus = pgEnum("user_status", ["pending", "approved", "rejected"]);
export const userRole = pgEnum("user_role", ["user", "admin"]);
export const attachmentKind = pgEnum("attachment_kind", [
  "file",
  "receipt",
  "image",
  "document",
  "manual",
]);
// Where an attachment came from: uploaded by the user, or found online by the agent.
export const attachmentSource = pgEnum("attachment_source", ["upload", "web"]);
// Maintenance task lifecycle + where a task/routine came from.
export const maintenanceStatus = pgEnum("maintenance_status", ["planned", "done"]);
export const taskSource = pgEnum("task_source", ["user", "manual", "web"]);

// ── Users ─────────────────────────────────────────────────────────────────────
// Access is gated: a new Google login lands as `pending` until an admin approves.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  image: text("image"),
  role: userRole("role").notNull().default("user"),
  status: userStatus("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedBy: uuid("approved_by"),
});

// ── Items ─────────────────────────────────────────────────────────────────────
// An item is anything you care about: house, bike, MC, computer, network, cabin,
// boat, a travel plan, etc. `category` and `fields` keep it fully generic.
export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    category: text("category").notNull().default("general"),
    description: text("description"),
    // Free-form structured specs: serial numbers, model, VIN, IP ranges, dates...
    fields: jsonb("fields").$type<Record<string, string>>().default({}),
    tags: text("tags").array().default([]),
    location: text("location"),
    // AI-distilled "living" front page: a markdown summary + a one-line at-a-glance,
    // refreshed when the item changes. `layout` is the inferred archetype that drives
    // the adaptive front-page presentation; `fieldsMeta` marks hero fields + type hints.
    summaryMd: text("summary_md"),
    summaryAtAGlance: text("summary_at_a_glance"),
    summaryUpdatedAt: timestamp("summary_updated_at", { withTimezone: true }),
    layout: text("layout").notNull().default("generic"),
    fieldsMeta: jsonb("fields_meta")
      .$type<Record<string, { hero?: boolean; type?: string }>>()
      .default({}),
    // Semantic embedding of the item's title + description + fields, for AI search.
    embedding: vector("embedding", { dimensions: EMBEDDING_DIM }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerIdx: index("items_owner_idx").on(t.ownerId),
    categoryIdx: index("items_category_idx").on(t.category),
    // HNSW index for fast cosine-similarity vector search.
    embeddingIdx: index("items_embedding_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops")
    ),
  })
);

// ── Maintenance tasks ─────────────────────────────────────────────────────────
// Service/maintenance entries for an item. `planned` tasks with a `dueDate` power
// the reminders dashboard; `done` tasks (with `completedAt`) are the service log.
// `recurrenceMonths`/`recurrenceNote` describe routines (e.g. every 6 months).
export const maintenanceTasks = pgTable(
  "maintenance_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    status: maintenanceStatus("status").notNull().default("planned"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cost: text("cost"),
    recurrenceMonths: integer("recurrence_months"),
    recurrenceNote: text("recurrence_note"),
    source: taskSource("source").notNull().default("user"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    itemIdx: index("maintenance_tasks_item_idx").on(t.itemId),
    dueIdx: index("maintenance_tasks_due_idx").on(t.dueDate),
    statusIdx: index("maintenance_tasks_status_idx").on(t.status),
  })
);

// ── Attachments ─────────────────────────────────────────────────────────────────
// Files / receipts / images stored on local disk; `storageKey` is the path under
// UPLOAD_DIR. `extractedText` holds OCR'd / parsed text used for search, and
// `embedding` is its semantic vector. An attachment may optionally belong to a
// maintenance task (its gallery / documents) via `taskId`.
export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => maintenanceTasks.id, { onDelete: "cascade" }),
    kind: attachmentKind("kind").notNull().default("file"),
    source: attachmentSource("source").notNull().default("upload"),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
    storageKey: text("storage_key").notNull(),
    // For web-sourced docs: where it was found.
    sourceUrl: text("source_url"),
    sourceTitle: text("source_title"),
    extractedText: text("extracted_text"),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIM }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    itemIdx: index("attachments_item_idx").on(t.itemId),
    taskIdx: index("attachments_task_idx").on(t.taskId),
    embeddingIdx: index("attachments_embedding_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops")
    ),
  })
);

// ── Notes ────────────────────────────────────────────────────────────────────
// Timestamped free-text notes attached to an item (service logs, reminders...).
export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIM }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    itemIdx: index("notes_item_idx").on(t.itemId),
  })
);

// ── Relations ──────────────────────────────────────────────────────────────────
export const usersRelations = relations(users, ({ many }) => ({
  items: many(items),
}));

export const itemsRelations = relations(items, ({ one, many }) => ({
  owner: one(users, { fields: [items.ownerId], references: [users.id] }),
  attachments: many(attachments),
  notes: many(notes),
  tasks: many(maintenanceTasks),
}));

export const maintenanceTasksRelations = relations(maintenanceTasks, ({ one, many }) => ({
  item: one(items, { fields: [maintenanceTasks.itemId], references: [items.id] }),
  attachments: many(attachments),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  item: one(items, { fields: [attachments.itemId], references: [items.id] }),
  task: one(maintenanceTasks, {
    fields: [attachments.taskId],
    references: [maintenanceTasks.id],
  }),
}));

export const notesRelations = relations(notes, ({ one }) => ({
  item: one(items, { fields: [notes.itemId], references: [items.id] }),
}));

export type User = typeof users.$inferSelect;
export type Item = typeof items.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type MaintenanceTask = typeof maintenanceTasks.$inferSelect;
