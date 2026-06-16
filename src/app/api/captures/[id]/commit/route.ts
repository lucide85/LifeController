import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { captures, items, attachments, notes } from "@/lib/db/schema";
import { getApprovedUserOrNull } from "@/lib/auth-guard";
import { saveBuffer } from "@/lib/storage";
import { embed, itemEmbedText } from "@/lib/ai/embeddings";
import { downloadImage } from "@/lib/ingest/url";

export const runtime = "nodejs";
export const maxDuration = 90;

const schema = z.object({
  action: z.enum(["attach", "create"]),
  targetItemId: z.string().uuid().optional(),
  title: z.string().min(1).max(300).optional(),
  category: z.string().min(1).max(80).optional(),
  description: z.string().max(10000).optional(),
  tags: z.array(z.string().max(60)).max(40).optional(),
  fields: z.record(z.string(), z.string()).optional(),
  layout: z
    .enum(["property", "vehicle", "travel", "tech", "vessel", "document", "generic"])
    .optional(),
});

function kindFor(mime: string): "file" | "image" | "document" {
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "document";
  return "file";
}

// Commit a confirmed capture: create or pick the target item, attach the captured
// content to it (file → attachment, url → web doc + hero image, text → note), then
// mark the capture filed.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getApprovedUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const capture = await db.query.captures.findFirst({
    where: and(eq(captures.id, id), eq(captures.ownerId, user.id)),
  });
  if (!capture) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (capture.status !== "inbox") {
    return NextResponse.json({ error: "Capture already handled" }, { status: 409 });
  }

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const d = parsed.data;

  // Resolve the target item (create new, or verify ownership of an existing one).
  let itemId: string;
  if (d.action === "create") {
    const title = d.title ?? "Untitled";
    const category = d.category ?? "general";
    const tags = d.tags ?? [];
    const fields = d.fields ?? {};
    const description = d.description ?? null;
    const embedding = await embed(
      itemEmbedText({ title, category, description, fields, tags })
    );
    const [createdItem] = await db
      .insert(items)
      .values({
        ownerId: user.id,
        title,
        category,
        description,
        tags,
        fields,
        ...(d.layout ? { layout: d.layout } : {}),
        embedding: embedding ?? null,
      })
      .returning({ id: items.id });
    itemId = createdItem.id;
  } else {
    if (!d.targetItemId) {
      return NextResponse.json({ error: "targetItemId required to attach" }, { status: 400 });
    }
    const target = await db.query.items.findFirst({
      where: and(eq(items.id, d.targetItemId), eq(items.ownerId, user.id)),
      columns: { id: true },
    });
    if (!target) return NextResponse.json({ error: "Target item not found" }, { status: 404 });
    itemId = target.id;
  }

  // Attach the captured content onto the item.
  if (capture.kind === "file" && capture.storageKey) {
    await db.insert(attachments).values({
      itemId,
      kind: kindFor(capture.mimeType ?? ""),
      source: "upload",
      fileName: capture.fileName ?? "file",
      mimeType: capture.mimeType ?? "application/octet-stream",
      sizeBytes: capture.sizeBytes ?? 0,
      storageKey: capture.storageKey, // reuse the bytes already on disk under _inbox/
      extractedText: capture.extractedText,
      embedding: capture.embedding,
    });
  } else if (capture.kind === "url") {
    // Store the readable text as a web-sourced document attachment.
    const docText = capture.extractedText ?? "";
    const { storageKey, sizeBytes } = await saveBuffer(
      itemId,
      `${(capture.sourceTitle ?? "web").slice(0, 60)}.txt`,
      Buffer.from(docText, "utf-8")
    );
    await db.insert(attachments).values({
      itemId,
      kind: "document",
      source: "web",
      fileName: `${(capture.sourceTitle ?? capture.sourceUrl ?? "web page").slice(0, 80)}`,
      mimeType: "text/plain",
      sizeBytes,
      storageKey,
      sourceUrl: capture.sourceUrl,
      canonicalUrl: capture.sourceUrl,
      sourceTitle: capture.sourceTitle,
      extractedText: docText || null,
      embedding: capture.embedding,
    });

    // Download the hero image (best-effort) and attach it too.
    if (capture.imageUrl) {
      const img = await downloadImage(capture.imageUrl);
      if (img) {
        const saved = await saveBuffer(itemId, img.fileName, img.buffer);
        await db.insert(attachments).values({
          itemId,
          kind: "image",
          source: "web",
          fileName: img.fileName,
          mimeType: img.mimeType,
          sizeBytes: saved.sizeBytes,
          storageKey: saved.storageKey,
          sourceUrl: capture.sourceUrl,
        });
      }
    }
  } else if (capture.kind === "text" && capture.rawText) {
    await db.insert(notes).values({
      itemId,
      body: capture.rawText,
      embedding: capture.embedding,
    });
  }

  await db.update(items).set({ updatedAt: new Date() }).where(eq(items.id, itemId));
  await db
    .update(captures)
    .set({ status: "filed", filedItemId: itemId })
    .where(eq(captures.id, id));

  return NextResponse.json({ ok: true, itemId });
}
