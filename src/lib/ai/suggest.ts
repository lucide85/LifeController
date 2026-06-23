// Proactive cross-item intelligence: a periodic sweep that PROPOSES (never applies)
// likely duplicates, candidate links, and spec-field gaps it can fill from an item's
// own stored documents. Results land in the `suggestions` table as pending rows the
// owner accepts or dismisses. Hard caps keep a single scan cheap and bounded — this
// runs on the one long-lived Next process, so it must not run away on time or tokens.
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { items, attachments, notes, itemLinks, suggestions } from "@/lib/db/schema";
import { embeddingsEnabled } from "@/lib/ai/embeddings";
import { relatedItems } from "@/lib/ai/search";
import { proposeFieldChanges } from "@/lib/ai/writeback";
import { hasAnthropic } from "@/lib/ai/anthropic";

// Cosine similarity thresholds (0..1). At/above DUP and same category → likely the
// same thing (offer to link as duplicate). At/above LINK → worth offering a relation.
const DUP_THRESHOLD = 0.9;
const LINK_THRESHOLD = 0.75;

// Hard caps so one scan stays cheap and bounded.
const MAX_ITEMS = 250; // items considered for neighbour search (most-recent first)
const NEIGHBORS_PER_ITEM = 5;
const MAX_PAIR_SUGGESTIONS = 60; // duplicate + link rows per scan
const MAX_DOC_MINES = 15; // items whose documents we mine for gaps (1 AI call each)
const DOC_TEXT_BUDGET = 16000; // chars of stored text fed to the extractor per item

// Order-independent key for a pair of item ids, so A↔B and B↔A collapse to one.
function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

type Row = typeof suggestions.$inferInsert;

export interface ScanResult {
  scanned: number;
  duplicates: number;
  links: number;
  gaps: number;
  created: number;
}

export async function generateSuggestions(ownerId: string): Promise<ScanResult> {
  const result: ScanResult = { scanned: 0, duplicates: 0, links: 0, gaps: 0, created: 0 };

  const allItems = await db
    .select({
      id: items.id,
      title: items.title,
      category: items.category,
    })
    .from(items)
    .where(eq(items.ownerId, ownerId))
    .orderBy(desc(items.updatedAt))
    .limit(MAX_ITEMS);
  result.scanned = allItems.length;
  if (allItems.length === 0) return result;

  const candidates: Row[] = [];

  // ── 1) Duplicate + link detection (embedding-driven, no AI cost) ───────────────
  if (embeddingsEnabled()) {
    // Pairs already linked (either direction) are skipped.
    const existing = await db
      .select({ from: itemLinks.fromItemId, to: itemLinks.toItemId })
      .from(itemLinks)
      .where(eq(itemLinks.ownerId, ownerId));
    const linked = new Set(existing.map((l) => pairKey(l.from, l.to)));

    const titleById = new Map(allItems.map((i) => [i.id, i.title]));
    const catById = new Map(allItems.map((i) => [i.id, i.category]));
    const seen = new Set<string>();
    let pairCount = 0;

    for (const it of allItems) {
      if (pairCount >= MAX_PAIR_SUGGESTIONS) break;
      const neighbors = await relatedItems(ownerId, it.id, NEIGHBORS_PER_ITEM);
      for (const n of neighbors) {
        if (pairCount >= MAX_PAIR_SUGGESTIONS) break;
        const key = pairKey(it.id, n.id);
        if (seen.has(key)) continue;
        seen.add(key);
        if (linked.has(key)) continue;

        const sameCategory = (catById.get(n.id) ?? n.category) === it.category;
        const isDup = n.score >= DUP_THRESHOLD && sameCategory;
        const isLink = !isDup && n.score >= LINK_THRESHOLD;
        if (!isDup && !isLink) continue;

        const otherTitle = titleById.get(n.id) ?? n.title;
        const pct = Math.round(n.score * 100);
        candidates.push({
          ownerId,
          kind: isDup ? "duplicate" : "link",
          itemId: it.id,
          relatedItemId: n.id,
          relation: isDup ? null : "related",
          confidence: n.score,
          title: isDup
            ? `Possible duplicate: “${it.title}” & “${otherTitle}”`
            : `Relate “${it.title}” and “${otherTitle}”?`,
          detail: isDup
            ? `These two ${it.category} items look very similar (${pct}% match). Link them as related, or dismiss.`
            : `These items seem related (${pct}% match). Want to link them?`,
          // Kind-INDEPENDENT pair key: a dismissed pair must stay dismissed even if its
          // classification later flips (a category edit or a score drifting across the
          // duplicate threshold) — the displayed kind still lives in the `kind` column.
          dedupeKey: `pair:${key}`,
        });
        if (isDup) result.duplicates++;
        else result.links++;
        pairCount++;
      }
    }
  }

  // ── 2) Field-gap detection — mine an item's OWN documents (AI, but bounded) ─────
  // We only surface facts found in the item's stored documents/notes for fields that
  // are currently EMPTY (proposeFieldChanges classifies those as "auto"/"review");
  // existing values are never proposed for overwrite here.
  if (hasAnthropic()) {
    const docItems = await db
      .selectDistinct({
        id: items.id,
        title: items.title,
        category: items.category,
        fields: items.fields,
        updatedAt: items.updatedAt,
      })
      .from(items)
      .innerJoin(attachments, eq(attachments.itemId, items.id))
      .where(and(eq(items.ownerId, ownerId), isNotNull(attachments.extractedText)))
      .orderBy(desc(items.updatedAt))
      .limit(MAX_DOC_MINES);

    for (const it of docItems) {
      const [atts, noteRows] = await Promise.all([
        db
          .select({ text: attachments.extractedText })
          .from(attachments)
          .where(and(eq(attachments.itemId, it.id), isNotNull(attachments.extractedText)))
          .limit(20),
        db.select({ body: notes.body }).from(notes).where(eq(notes.itemId, it.id)).limit(20),
      ]);

      const sourceText = [...atts.map((a) => a.text ?? ""), ...noteRows.map((n) => n.body)]
        .filter((t) => t && t.trim())
        .join("\n\n")
        .slice(0, DOC_TEXT_BUDGET);
      if (!sourceText.trim()) continue;

      let ops;
      try {
        ops = await proposeFieldChanges({
          itemContext: `${it.title} (${it.category})`,
          currentFields: it.fields ?? {},
          sourceText,
        });
      } catch (err) {
        console.error("field-gap mine failed for item", it.id, err);
        continue;
      }

      for (const op of ops) {
        // Only empty-field fills (ask-first); never propose overwriting a value.
        if (op.status !== "auto" && op.status !== "review") continue;
        candidates.push({
          ownerId,
          kind: "field_gap",
          itemId: it.id,
          fieldKey: op.key,
          proposedValue: op.newValue,
          confidence: op.confidence,
          title: `Add “${op.key}” to “${it.title}”?`,
          detail: `Found in this item's own documents — ${op.key}: ${op.newValue}`,
          dedupeKey: `gap:${it.id}:${op.key.toLowerCase()}`,
        });
        result.gaps++;
      }
    }
  }

  if (candidates.length === 0) return result;

  // Collapse any duplicate dedupeKeys within this batch (defensive — keep the first),
  // then insert; ON CONFLICT skips rows the owner already accepted/dismissed earlier.
  const byKey = new Map<string, Row>();
  for (const c of candidates) {
    if (!byKey.has(c.dedupeKey)) byKey.set(c.dedupeKey, c);
  }
  const inserted = await db
    .insert(suggestions)
    .values([...byKey.values()])
    .onConflictDoNothing()
    .returning({ id: suggestions.id });
  result.created = inserted.length;

  return result;
}
