import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
  vector,
  bigint,
  real,
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
// Where a recorded spec-field value came from (provenance / write-back history).
export const factSource = pgEnum("fact_source", ["manual", "ai", "chat", "web", "upload"]);
// Capture-inbox lifecycle + what kind of raw thing was dropped.
export const captureStatus = pgEnum("capture_status", ["inbox", "filed", "discarded"]);
export const captureKind = pgEnum("capture_kind", ["text", "url", "file"]);
// Proactive cross-item suggestions: what kind of proposal + its review lifecycle.
export const suggestionKind = pgEnum("suggestion_kind", ["duplicate", "link", "field_gap"]);
export const suggestionStatus = pgEnum("suggestion_status", ["pending", "accepted", "dismissed"]);

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
    // The image attachment chosen as this item's cover/hero (nullable; no FK so an
    // attachment delete just leaves a dangling id we null-check on read).
    heroAttachmentId: uuid("hero_attachment_id"),
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
    // Normalized URL for idempotent de-duplication of web captures.
    canonicalUrl: text("canonical_url"),
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

// ── Fact revisions ─────────────────────────────────────────────────────────────
// Non-destructive history of spec-field values: every write-back (and confirmed
// AI/chat fact) appends a row recording old→new, where it came from, and how
// confident we were. The current value still lives in items.fields; this is the
// provenance/audit trail ("why is this here?") and the basis for undo.
export const factRevisions = pgTable(
  "fact_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    fieldKey: text("field_key").notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    source: factSource("source").notNull().default("manual"),
    sourceUrl: text("source_url"),
    sourceRef: text("source_ref"),
    confidence: real("confidence"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    itemIdx: index("fact_revisions_item_idx").on(t.itemId),
    itemFieldIdx: index("fact_revisions_item_field_idx").on(t.itemId, t.fieldKey),
  })
);

// ── Captures (drop-and-structure inbox) ─────────────────────────────────────────
// A raw thing dropped into the inbox with no chosen item: pasted text, a URL, or
// an uploaded file. AI triage proposes how to file it (attach to an existing item
// or create a new one); the proposal lives in `suggestedAction` until the owner
// confirms, at which point it becomes a real item/attachment/note and status=filed.
export const captures = pgTable(
  "captures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: captureStatus("status").notNull().default("inbox"),
    kind: captureKind("kind").notNull().default("text"),
    rawText: text("raw_text"),
    sourceUrl: text("source_url"),
    sourceTitle: text("source_title"),
    fileName: text("file_name"),
    mimeType: text("mime_type"),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
    storageKey: text("storage_key"),
    // For URL captures: the og:image we downloaded (stored as a storageKey too).
    imageUrl: text("image_url"),
    extractedText: text("extracted_text"),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIM }),
    // The AI triage proposal (action/target/newItem/tags/summary/candidates).
    suggestedAction: jsonb("suggested_action").$type<Record<string, unknown>>(),
    filedItemId: uuid("filed_item_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerIdx: index("captures_owner_idx").on(t.ownerId),
    statusIdx: index("captures_status_idx").on(t.status),
    embeddingIdx: index("captures_embedding_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops")
    ),
  })
);

// ── Item links ───────────────────────────────────────────────────────────────
// Confirmed, typed relationships between two of the owner's items (e.g. a charger
// "accessory-of" a laptop, a receipt "covers" an appliance). Bidirectional: read
// by querying both from/to. `origin` records whether the owner or AI proposed it.
export const itemLinks = pgTable(
  "item_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fromItemId: uuid("from_item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    toItemId: uuid("to_item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    relation: text("relation").notNull().default("related"),
    origin: text("origin").notNull().default("user"),
    confidence: real("confidence"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueIdx: uniqueIndex("item_links_unique_idx").on(t.fromItemId, t.toItemId, t.relation),
    fromIdx: index("item_links_from_idx").on(t.fromItemId),
    toIdx: index("item_links_to_idx").on(t.toItemId),
  })
);

// ── Suggestions (proactive cross-item intelligence) ─────────────────────────────
// Ambient proposals the app surfaces for the owner to accept or dismiss: likely
// duplicates, candidate links between items, and spec-field gaps it can fill from an
// item's own stored documents. Nothing is applied without the owner confirming.
// `dedupeKey` (unique per owner) stops the periodic scan re-proposing something the
// owner already accepted or dismissed (the resolved row stays and blocks re-insert).
export const suggestions = pgTable(
  "suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: suggestionKind("kind").notNull(),
    status: suggestionStatus("status").notNull().default("pending"),
    // The subject item the suggestion is about.
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    // The other item (duplicate / link suggestions); null for field gaps.
    relatedItemId: uuid("related_item_id").references(() => items.id, { onDelete: "cascade" }),
    // Proposed relationship type for a link suggestion (e.g. "related", "accessory-of").
    relation: text("relation"),
    // Field-gap suggestions: which empty field, and the value to fill it with.
    fieldKey: text("field_key"),
    proposedValue: text("proposed_value"),
    title: text("title"),
    detail: text("detail"),
    sourceUrl: text("source_url"),
    confidence: real("confidence"),
    // Stable per-owner key used to avoid re-proposing the same thing.
    dedupeKey: text("dedupe_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => ({
    ownerIdx: index("suggestions_owner_idx").on(t.ownerId),
    statusIdx: index("suggestions_status_idx").on(t.status),
    dedupeIdx: uniqueIndex("suggestions_dedupe_idx").on(t.ownerId, t.dedupeKey),
  })
);

// ── Relations ──────────────────────────────────────────────────────────────────
export const usersRelations = relations(users, ({ many }) => ({
  items: many(items),
  captures: many(captures),
}));

export const capturesRelations = relations(captures, ({ one }) => ({
  owner: one(users, { fields: [captures.ownerId], references: [users.id] }),
}));

export const itemsRelations = relations(items, ({ one, many }) => ({
  owner: one(users, { fields: [items.ownerId], references: [users.id] }),
  attachments: many(attachments),
  notes: many(notes),
  tasks: many(maintenanceTasks),
  factRevisions: many(factRevisions),
}));

export const factRevisionsRelations = relations(factRevisions, ({ one }) => ({
  item: one(items, { fields: [factRevisions.itemId], references: [items.id] }),
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
export type FactRevision = typeof factRevisions.$inferSelect;
export type Capture = typeof captures.$inferSelect;
export type ItemLink = typeof itemLinks.$inferSelect;
export type Suggestion = typeof suggestions.$inferSelect;
