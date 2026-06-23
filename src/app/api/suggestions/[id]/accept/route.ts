import { NextRequest, NextResponse } from "next/server";
import { and, eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { items, itemLinks, factRevisions, suggestions } from "@/lib/db/schema";
import { getApprovedUserOrNull } from "@/lib/auth-guard";
import { embed, itemEmbedText } from "@/lib/ai/embeddings";

export const runtime = "nodejs";
export const maxDuration = 60;

// Mirrors the relation vocabulary used by the manual links UI.
const ALLOWED_RELATIONS = [
  "related",
  "part-of",
  "stored-in",
  "covers",
  "accessory-of",
  "replaces",
];

// Accept a pending suggestion. Link/duplicate → create a confirmed item link (origin
// "ai"). field_gap → fill the field, but ONLY if it's still empty (never clobber a
// value the owner set in the meantime), recording a fact_revision and re-embedding.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getApprovedUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const [sug] = await db
    .select()
    .from(suggestions)
    .where(and(eq(suggestions.id, id), eq(suggestions.ownerId, user.id)))
    .limit(1);
  if (!sug) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (sug.status !== "pending") {
    return NextResponse.json({ error: "Already resolved" }, { status: 409 });
  }

  let body: { relation?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // no body is fine
  }

  if (sug.kind === "link" || sug.kind === "duplicate") {
    if (!sug.relatedItemId || sug.relatedItemId === sug.itemId) {
      return NextResponse.json({ error: "Invalid link suggestion" }, { status: 400 });
    }
    // Both endpoints must (still) belong to the owner.
    const owned = await db
      .select({ id: items.id })
      .from(items)
      .where(
        and(
          eq(items.ownerId, user.id),
          or(eq(items.id, sug.itemId), eq(items.id, sug.relatedItemId))
        )
      );
    if (owned.length !== 2) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const requested = typeof body.relation === "string" ? body.relation : null;
    const relation =
      requested && ALLOWED_RELATIONS.includes(requested)
        ? requested
        : sug.relation && ALLOWED_RELATIONS.includes(sug.relation)
          ? sug.relation
          : "related";

    await db
      .insert(itemLinks)
      .values({
        ownerId: user.id,
        fromItemId: sug.itemId,
        toItemId: sug.relatedItemId,
        relation,
        origin: "ai",
        confidence: sug.confidence ?? null,
      })
      .onConflictDoNothing();
  } else if (sug.kind === "field_gap") {
    if (!sug.fieldKey || sug.proposedValue == null) {
      return NextResponse.json({ error: "Invalid field suggestion" }, { status: 400 });
    }
    const item = await db.query.items.findFirst({
      where: and(eq(items.id, sug.itemId), eq(items.ownerId, user.id)),
      columns: { embedding: false },
    });
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

    const key = sug.fieldKey.trim();
    const fields: Record<string, string> = { ...(item.fields ?? {}) };
    const existing = fields[key];
    // Only fill empty fields — if the owner has since set a value, leave it and just
    // resolve the suggestion (no overwrite without an explicit conflict review).
    if (key && (existing == null || existing.trim() === "")) {
      fields[key] = sug.proposedValue;
      const merged = { ...item, fields };
      const embedding = await embed(itemEmbedText(merged));
      await db
        .update(items)
        .set({ fields, ...(embedding ? { embedding } : {}), updatedAt: new Date() })
        .where(eq(items.id, sug.itemId));
      await db.insert(factRevisions).values({
        itemId: sug.itemId,
        fieldKey: key,
        oldValue: existing ?? null,
        newValue: sug.proposedValue,
        source: "ai",
        sourceUrl: sug.sourceUrl ?? null,
        confidence: sug.confidence ?? null,
      });
    }
  } else {
    return NextResponse.json({ error: "Unknown suggestion kind" }, { status: 400 });
  }

  await db
    .update(suggestions)
    .set({ status: "accepted", resolvedAt: new Date() })
    .where(and(eq(suggestions.id, id), eq(suggestions.ownerId, user.id)));

  return NextResponse.json({ ok: true });
}
