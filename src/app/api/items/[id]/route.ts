import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { items, attachments } from "@/lib/db/schema";
import { getApprovedUserOrNull } from "@/lib/auth-guard";
import { embed, itemEmbedText } from "@/lib/ai/embeddings";
import { deleteStored } from "@/lib/storage";

export const runtime = "nodejs";

async function ownItem(userId: string, id: string) {
  return db.query.items.findFirst({
    where: and(eq(items.id, id), eq(items.ownerId, userId)),
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getApprovedUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const item = await db.query.items.findFirst({
    where: and(eq(items.id, id), eq(items.ownerId, user.id)),
    columns: { embedding: false },
    with: {
      attachments: { columns: { embedding: false } },
      notes: { columns: { embedding: false } },
    },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item });
}

const patchSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  category: z.string().min(1).max(80).optional(),
  description: z.string().max(10000).nullable().optional(),
  location: z.string().max(300).nullable().optional(),
  tags: z.array(z.string().max(60)).max(40).optional(),
  fields: z.record(z.string(), z.string()).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getApprovedUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await ownItem(user.id, id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  const merged = {
    title: d.title ?? existing.title,
    category: d.category ?? existing.category,
    description: d.description === undefined ? existing.description : d.description,
    location: d.location === undefined ? existing.location : d.location,
    tags: d.tags ?? existing.tags ?? [],
    fields: d.fields ?? existing.fields ?? {},
  };

  const embedding = await embed(itemEmbedText(merged));

  const [updated] = await db
    .update(items)
    .set({ ...merged, embedding: embedding ?? existing.embedding, updatedAt: new Date() })
    .where(eq(items.id, id))
    .returning();

  return NextResponse.json({ item: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getApprovedUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await ownItem(user.id, id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Remove stored files from disk before deleting rows (cascade handles DB rows).
  const atts = await db.query.attachments.findMany({
    where: eq(attachments.itemId, id),
  });
  await Promise.all(atts.map((a) => deleteStored(a.storageKey)));

  await db.delete(items).where(eq(items.id, id));
  return NextResponse.json({ ok: true });
}
