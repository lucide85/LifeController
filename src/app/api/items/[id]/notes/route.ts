import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { items, notes } from "@/lib/db/schema";
import { getApprovedUserOrNull } from "@/lib/auth-guard";
import { embed } from "@/lib/ai/embeddings";

export const runtime = "nodejs";

const schema = z.object({ body: z.string().min(1).max(8000) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getApprovedUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const item = await db.query.items.findFirst({
    where: and(eq(items.id, id), eq(items.ownerId, user.id)),
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const embedding = await embed(parsed.data.body);
  const [created] = await db
    .insert(notes)
    .values({ itemId: id, body: parsed.data.body, embedding })
    .returning();

  await db.update(items).set({ updatedAt: new Date() }).where(eq(items.id, id));
  return NextResponse.json({ note: created }, { status: 201 });
}
