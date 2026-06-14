import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { items, attachments } from "@/lib/db/schema";
import { getApprovedUserOrNull } from "@/lib/auth-guard";
import { hasAnthropic } from "@/lib/ai/anthropic";
import { autofillFromFile } from "@/lib/ai/maintenance";
import { itemEmbedText } from "@/lib/ai/embeddings";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({ attachmentId: z.string().uuid() });

// Propose a description + spec fields for the item, extracted from one of its files.
// Returns the suggestion only; the client applies it via PATCH /api/items/[id].
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getApprovedUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasAnthropic()) {
    return NextResponse.json({ error: "AI is not configured (no ANTHROPIC_API_KEY)." }, { status: 400 });
  }
  const { id } = await params;

  const item = await db.query.items.findFirst({
    where: and(eq(items.id, id), eq(items.ownerId, user.id)),
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const att = await db.query.attachments.findFirst({
    where: and(eq(attachments.id, parsed.data.attachmentId), eq(attachments.itemId, id)),
  });
  if (!att) return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  if (!att.extractedText) {
    return NextResponse.json(
      { error: "No readable text was extracted from that file." },
      { status: 422 }
    );
  }

  const suggestion = await autofillFromFile(itemEmbedText(item), att.extractedText);
  return NextResponse.json(suggestion);
}
