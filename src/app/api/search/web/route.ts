import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { items, attachments } from "@/lib/db/schema";
import { getApprovedUserOrNull } from "@/lib/auth-guard";
import { searchWeb } from "@/lib/ai/agent";
import { hasAnthropic } from "@/lib/ai/anthropic";
import { itemEmbedText, embed } from "@/lib/ai/embeddings";
import { saveBuffer } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({
  q: z.string().min(1).max(2000),
  itemId: z.string().uuid().optional(),
  // When true, store the found document back into the library as a web-sourced
  // attachment (requires itemId).
  store: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  const user = await getApprovedUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!hasAnthropic()) {
    return NextResponse.json(
      { error: "Web search requires ANTHROPIC_API_KEY." },
      { status: 400 }
    );
  }

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { q, itemId, store } = parsed.data;

  // Ground the search in what we already know about the item.
  let itemContext = "(no specific item selected)";
  let item = null as Awaited<ReturnType<typeof db.query.items.findFirst>> | null;
  if (itemId) {
    item = await db.query.items.findFirst({
      where: and(eq(items.id, itemId), eq(items.ownerId, user.id)),
    });
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    itemContext = itemEmbedText(item);
  }

  const finding = await searchWeb(q, itemContext);

  let storedAttachmentId: string | null = null;
  if (store && item) {
    const buffer = Buffer.from(finding.documentText, "utf-8");
    const fileName = `${finding.documentTitle}.md`.replace(/[\\/:*?"<>|]/g, "_");
    const { storageKey, sizeBytes } = await saveBuffer(item.id, fileName, buffer);
    const embedding = await embed(`${finding.documentTitle}\n${finding.documentText}`);

    const [created] = await db
      .insert(attachments)
      .values({
        itemId: item.id,
        kind: "document",
        source: "web",
        fileName,
        mimeType: "text/markdown",
        sizeBytes,
        storageKey,
        sourceUrl: finding.citations[0]?.url ?? null,
        sourceTitle: finding.citations[0]?.title ?? null,
        extractedText: finding.documentText,
        embedding,
      })
      .returning();

    storedAttachmentId = created.id;
    await db.update(items).set({ updatedAt: new Date() }).where(eq(items.id, item.id));
  }

  return NextResponse.json({
    answer: finding.answer,
    citations: finding.citations,
    stored: Boolean(storedAttachmentId),
    storedAttachmentId,
  });
}
