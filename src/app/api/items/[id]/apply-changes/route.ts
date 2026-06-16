import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { items, factRevisions } from "@/lib/db/schema";
import { getApprovedUserOrNull } from "@/lib/auth-guard";
import { embed, itemEmbedText } from "@/lib/ai/embeddings";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  source: z.enum(["chat", "web", "manual", "ai", "upload"]).default("chat"),
  // http(s) only: zod's .url() also accepts javascript:/data: URLs, which would
  // become a clickable href on the front page (self-XSS). Restrict the scheme.
  sourceUrl: z
    .string()
    .url()
    .max(2000)
    .refine((u) => /^https?:\/\//i.test(u), "URL must be http(s)")
    .optional(),
  ops: z
    .array(
      z.object({
        key: z.string().min(1).max(80),
        value: z.string().max(500),
        confidence: z.number().min(0).max(1).optional(),
      })
    )
    .min(1)
    .max(50),
});

// Apply a user-confirmed set of spec-field changes: write them to items.fields,
// record one fact_revision per change (provenance / non-destructive history), and
// re-embed. The summary is intentionally NOT regenerated inline (refresh is lazy).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getApprovedUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const item = await db.query.items.findFirst({
    where: and(eq(items.id, id), eq(items.ownerId, user.id)),
    columns: { embedding: false },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { source, sourceUrl, ops } = parsed.data;

  const fields: Record<string, string> = { ...(item.fields ?? {}) };
  const revisions: (typeof factRevisions.$inferInsert)[] = [];
  let changed = 0;
  for (const op of ops) {
    const key = op.key.trim();
    if (!key) continue;
    const oldValue = fields[key] ?? null;
    if (oldValue !== null && oldValue.trim() === op.value.trim()) continue; // no-op
    fields[key] = op.value;
    revisions.push({
      itemId: id,
      fieldKey: key,
      oldValue,
      newValue: op.value,
      source,
      sourceUrl: sourceUrl ?? null,
      confidence: op.confidence ?? null,
    });
    changed++;
  }

  if (changed === 0) {
    return NextResponse.json({ ok: true, changed: 0, fields });
  }

  const merged = { ...item, fields };
  const embedding = await embed(itemEmbedText(merged));

  await db
    .update(items)
    .set({ fields, ...(embedding ? { embedding } : {}), updatedAt: new Date() })
    .where(eq(items.id, id));

  if (revisions.length) {
    await db.insert(factRevisions).values(revisions);
  }

  return NextResponse.json({ ok: true, changed, fields });
}
