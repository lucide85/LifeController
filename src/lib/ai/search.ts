// Retrieval over a user's library. Uses pgvector cosine similarity when
// embeddings are available, otherwise falls back to keyword (ILIKE) matching.
import { and, eq, ne, sql, desc, or, ilike, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { items, attachments, notes } from "@/lib/db/schema";
import { embed, embeddingsEnabled } from "./embeddings";

export interface RetrievedChunk {
  kind: "item" | "attachment" | "note";
  itemId: string;
  itemTitle: string;
  text: string;
  score: number;
  attachmentId?: string;
  noteId?: string;
  sourceUrl?: string | null;
}

const SIM = (col: any, vec: number[]) =>
  sql<number>`1 - (${col} <=> ${JSON.stringify(vec)}::vector)`;

// Stable identity for de-duplicating chunks that surface from more than one path
// (e.g. the same note from both the semantic and the keyword pass).
function chunkKey(c: RetrievedChunk): string {
  if (c.kind === "attachment") return `att:${c.attachmentId}`;
  if (c.kind === "note") return `note:${c.noteId}`;
  return `item:${c.itemId}`;
}

// Merge several result lists, keeping the highest score per unique chunk.
function mergeChunks(lists: RetrievedChunk[][], limit: number): RetrievedChunk[] {
  const best = new Map<string, RetrievedChunk>();
  for (const list of lists) {
    for (const c of list) {
      const key = chunkKey(c);
      const prev = best.get(key);
      if (!prev || c.score > prev.score) best.set(key, c);
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

export async function retrieve(
  userId: string,
  query: string,
  limit = 8
): Promise<RetrievedChunk[]> {
  const qVec = embeddingsEnabled() ? await embed(query, "query") : null;

  if (qVec) {
    // Run semantic + a keyword pass together: semantic gives conceptual recall,
    // keyword guarantees exact identifiers (VINs, serials, IPs) that embeddings
    // are weak at are never missed. Merge and keep the best score per chunk.
    const [semantic, keyword] = await Promise.all([
      retrieveSemantic(userId, qVec, limit),
      // Best-effort: the keyword pass only ADDS exact-match recall, so a failure
      // here must never take down the semantic baseline (returns 500 otherwise).
      retrieveKeyword(userId, query, limit).catch((e) => {
        console.error("keyword retrieval pass failed:", e);
        return [] as RetrievedChunk[];
      }),
    ]);
    return mergeChunks([semantic, keyword], limit);
  }
  return mergeChunks([await retrieveKeyword(userId, query, limit)], limit);
}

// Items most similar to a given item, by embedding cosine distance. Powers the
// "Related items" suggestions. Pure nearest-neighbour read, no AI call.
export interface RelatedItem {
  id: string;
  title: string;
  category: string;
  description: string | null;
  location: string | null;
  score: number;
}

export async function relatedItems(
  userId: string,
  itemId: string,
  limit = 6
): Promise<RelatedItem[]> {
  const [self] = await db
    .select({ embedding: items.embedding })
    .from(items)
    .where(and(eq(items.id, itemId), eq(items.ownerId, userId)))
    .limit(1);

  const vec = self?.embedding as number[] | null | undefined;
  if (!vec) return []; // item not embedded (AI was off at create) → nothing to relate.

  const sim = SIM(items.embedding, vec);
  const rows = await db
    .select({
      id: items.id,
      title: items.title,
      category: items.category,
      description: items.description,
      location: items.location,
      score: sim,
    })
    .from(items)
    .where(
      and(
        eq(items.ownerId, userId),
        ne(items.id, itemId),
        sql`${items.embedding} is not null`
      )
    )
    .orderBy(desc(sim))
    .limit(limit);

  return rows.map((r) => ({ ...r, score: Number(r.score) }));
}

async function retrieveSemantic(
  userId: string,
  qVec: number[],
  limit: number
): Promise<RetrievedChunk[]> {
  // Compute each similarity expression once so we can both select and order by it.
  const itemSim = SIM(items.embedding, qVec);
  const attSim = SIM(attachments.embedding, qVec);
  const noteSim = SIM(notes.embedding, qVec);

  // Items owned by the user.
  const itemRows = await db
    .select({
      id: items.id,
      title: items.title,
      description: items.description,
      category: items.category,
      score: itemSim,
    })
    .from(items)
    .where(and(eq(items.ownerId, userId), sql`${items.embedding} is not null`))
    .orderBy(desc(itemSim))
    .limit(limit);

  const attRows = await db
    .select({
      id: attachments.id,
      itemId: attachments.itemId,
      fileName: attachments.fileName,
      extractedText: attachments.extractedText,
      sourceUrl: attachments.sourceUrl,
      itemTitle: items.title,
      score: attSim,
    })
    .from(attachments)
    .innerJoin(items, eq(attachments.itemId, items.id))
    .where(and(eq(items.ownerId, userId), sql`${attachments.embedding} is not null`))
    .orderBy(desc(attSim))
    .limit(limit);

  const noteRows = await db
    .select({
      id: notes.id,
      itemId: notes.itemId,
      body: notes.body,
      itemTitle: items.title,
      score: noteSim,
    })
    .from(notes)
    .innerJoin(items, eq(notes.itemId, items.id))
    .where(and(eq(items.ownerId, userId), sql`${notes.embedding} is not null`))
    .orderBy(desc(noteSim))
    .limit(limit);

  const chunks: RetrievedChunk[] = [
    ...itemRows.map((r) => ({
      kind: "item" as const,
      itemId: r.id,
      itemTitle: r.title,
      text: [r.title, r.category, r.description].filter(Boolean).join(" — "),
      score: Number(r.score),
    })),
    ...attRows.map((r) => ({
      kind: "attachment" as const,
      itemId: r.itemId,
      itemTitle: r.itemTitle,
      attachmentId: r.id,
      sourceUrl: r.sourceUrl,
      text: `${r.fileName}: ${(r.extractedText ?? "").slice(0, 1200)}`,
      score: Number(r.score),
    })),
    ...noteRows.map((r) => ({
      kind: "note" as const,
      itemId: r.itemId,
      itemTitle: r.itemTitle,
      noteId: r.id,
      text: r.body.slice(0, 1200),
      score: Number(r.score),
    })),
  ];

  return chunks.sort((a, b) => b.score - a.score).slice(0, limit);
}

async function retrieveKeyword(
  userId: string,
  query: string,
  limit: number
): Promise<RetrievedChunk[]> {
  const q = `%${query}%`;

  const itemRows = await db
    .select({
      id: items.id,
      title: items.title,
      description: items.description,
      category: items.category,
    })
    .from(items)
    .where(
      and(
        eq(items.ownerId, userId),
        or(
          ilike(items.title, q),
          ilike(items.description, q),
          ilike(items.category, q),
          ilike(items.location, q),
          // Match exact identifiers stored in spec fields (VIN, serial, IP…) and
          // tags — the jsonb/array is cast to text so ILIKE can scan its values.
          ilike(sql`${items.fields}::text`, q),
          ilike(sql`array_to_string(${items.tags}, ' ')`, q)
        )
      )
    )
    .limit(limit);

  const ownItemIds = (
    await db.select({ id: items.id }).from(items).where(eq(items.ownerId, userId))
  ).map((r) => r.id);

  const attRows = ownItemIds.length
    ? await db
        .select({
          id: attachments.id,
          itemId: attachments.itemId,
          fileName: attachments.fileName,
          extractedText: attachments.extractedText,
          sourceUrl: attachments.sourceUrl,
          itemTitle: items.title,
        })
        .from(attachments)
        .innerJoin(items, eq(attachments.itemId, items.id))
        .where(
          and(
            inArray(attachments.itemId, ownItemIds),
            or(ilike(attachments.fileName, q), ilike(attachments.extractedText, q))
          )
        )
        .limit(limit)
    : [];

  const noteRows = ownItemIds.length
    ? await db
        .select({
          id: notes.id,
          itemId: notes.itemId,
          body: notes.body,
          itemTitle: items.title,
        })
        .from(notes)
        .innerJoin(items, eq(notes.itemId, items.id))
        .where(and(inArray(notes.itemId, ownItemIds), ilike(notes.body, q)))
        .limit(limit)
    : [];

  return [
    ...itemRows.map((r) => ({
      kind: "item" as const,
      itemId: r.id,
      itemTitle: r.title,
      text: [r.title, r.category, r.description].filter(Boolean).join(" — "),
      score: 0.5,
    })),
    ...attRows.map((r) => ({
      kind: "attachment" as const,
      itemId: r.itemId,
      itemTitle: r.itemTitle,
      attachmentId: r.id,
      sourceUrl: r.sourceUrl,
      text: `${r.fileName}: ${(r.extractedText ?? "").slice(0, 1200)}`,
      score: 0.45,
    })),
    ...noteRows.map((r) => ({
      kind: "note" as const,
      itemId: r.itemId,
      itemTitle: r.itemTitle,
      noteId: r.id,
      text: r.body.slice(0, 1200),
      score: 0.45,
    })),
  ];
  // Each source is already capped at `limit`; the caller (retrieve) merges and
  // slices, so we don't truncate here — that would drop whole sources (notes).
}
