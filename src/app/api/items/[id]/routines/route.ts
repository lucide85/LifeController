import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { items, attachments } from "@/lib/db/schema";
import { getApprovedUserOrNull } from "@/lib/auth-guard";
import { hasAnthropic } from "@/lib/ai/anthropic";
import { suggestRoutinesFromText, suggestRoutinesFromWeb } from "@/lib/ai/maintenance";
import { itemEmbedText } from "@/lib/ai/embeddings";

export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({
  source: z.enum(["manual", "web"]),
  attachmentId: z.string().uuid().optional(),
});

// Propose maintenance routines for the item, from an uploaded manual or the web.
// Returns suggestions only; the client creates the chosen ones via POST tasks.
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

  const itemContext = itemEmbedText(item);

  try {
    if (parsed.data.source === "manual") {
      if (!parsed.data.attachmentId) {
        return NextResponse.json({ error: "Select a manual to read." }, { status: 400 });
      }
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
      const result = await suggestRoutinesFromText(itemContext, att.extractedText);
      return NextResponse.json(result);
    }

    const result = await suggestRoutinesFromWeb(itemContext);
    return NextResponse.json(result);
  } catch (err) {
    console.error("routines suggestion failed:", err);
    return NextResponse.json({ error: "Could not generate routines." }, { status: 500 });
  }
}
