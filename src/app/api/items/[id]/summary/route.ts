import { NextRequest, NextResponse } from "next/server";
import { and, eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { items, attachments, notes } from "@/lib/db/schema";
import { getApprovedUserOrNull } from "@/lib/auth-guard";
import { hasAnthropic } from "@/lib/ai/anthropic";
import { distillItem, buildFieldsMeta } from "@/lib/ai/distill";
import { embed, itemEmbedText } from "@/lib/ai/embeddings";

export const runtime = "nodejs";
export const maxDuration = 90;

// (Re)generate the AI-distilled living front page for an item.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getApprovedUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasAnthropic()) {
    return NextResponse.json(
      { error: "AI is not configured (no ANTHROPIC_API_KEY)." },
      { status: 400 }
    );
  }
  const { id } = await params;

  const item = await db.query.items.findFirst({
    where: and(eq(items.id, id), eq(items.ownerId, user.id)),
    columns: { embedding: false },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [itemNotes, itemDocs] = await Promise.all([
    db
      .select({ body: notes.body })
      .from(notes)
      .where(eq(notes.itemId, id))
      .orderBy(desc(notes.createdAt))
      .limit(30),
    db
      .select({ fileName: attachments.fileName, text: attachments.extractedText })
      .from(attachments)
      .where(eq(attachments.itemId, id))
      .orderBy(desc(attachments.createdAt))
      .limit(20),
  ]);

  try {
    const result = await distillItem({
      title: item.title,
      category: item.category,
      description: item.description,
      location: item.location,
      tags: item.tags ?? [],
      fields: item.fields ?? {},
      notes: itemNotes.map((n) => n.body),
      documents: itemDocs
        .filter((d) => d.text && d.text.trim())
        .map((d) => ({ fileName: d.fileName, text: d.text as string })),
    });

    if (!result) {
      return NextResponse.json(
        { error: "Could not generate a summary for this item." },
        { status: 422 }
      );
    }

    const fieldsMeta = buildFieldsMeta(item.fields ?? {}, result.heroFields, result.fieldTypes);

    // Re-embed including the summary so search benefits from the distilled text.
    const embedding = await embed(`${itemEmbedText(item)}\n${result.markdown}`);

    const [updated] = await db
      .update(items)
      .set({
        summaryMd: result.markdown,
        summaryAtAGlance: result.atAGlance,
        summaryUpdatedAt: new Date(),
        layout: result.layout,
        fieldsMeta,
        ...(embedding ? { embedding } : {}),
        updatedAt: new Date(),
      })
      .where(eq(items.id, id))
      .returning({
        summaryMd: items.summaryMd,
        summaryAtAGlance: items.summaryAtAGlance,
        layout: items.layout,
        fieldsMeta: items.fieldsMeta,
      });

    return NextResponse.json({ ok: true, ...updated });
  } catch (err) {
    console.error("summary generation failed:", err);
    const detail = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json(
      { error: `Summary generation failed (${detail}).` },
      { status: 500 }
    );
  }
}
