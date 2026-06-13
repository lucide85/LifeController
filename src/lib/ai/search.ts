// Retrieval over a user's library. Uses pgvector cosine similarity when
// embeddings are available, otherwise falls back to keyword (ILIKE) matching.
import { and, eq, sql, desc, or, ilike, inArray } from "drizzle-orm";
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
  sourceUrl?: string | null;
}

const SIM = (col: any, vec: number[]) =>
  sql<number>`1 - (${col} <=> ${JSON.stringify(vec)}::vector)`;

export async function retrieve(
  userId: string,
  query: string,
  limit = 8
): Promise<RetrievedChunk[]> {
  const qVec = embeddingsEnabled() ? await embed(query, "query") : null;

  if (qVec) {
    return retrieveSemantic(userId, qVec, limit);
  }
  return retrieveKeyword(userId, query, limit);
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
          ilike(items.location, q)
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
      score: 0.4,
    })),
  ].slice(0, limit);
}
