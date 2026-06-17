import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { items, attachments } from "@/lib/db/schema";
import { getApprovedUserOrNull } from "@/lib/auth-guard";
import { saveBuffer } from "@/lib/storage";
import { downloadImage } from "@/lib/ingest/url";

export const runtime = "nodejs";
export const maxDuration = 30;

const schema = z.object({
  clear: z.boolean().optional(),
  attachmentId: z.string().uuid().optional(),
  download: z
    .object({
      url: z.string().url(),
      sourceUrl: z.string().url().optional(),
      attribution: z.string().max(300).optional(),
    })
    .optional(),
});

// Set (or clear) the item's cover image: from an existing image attachment, or by
// downloading a chosen web image (e.g. a Wikimedia Commons candidate).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getApprovedUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const item = await db.query.items.findFirst({
    where: and(eq(items.id, id), eq(items.ownerId, user.id)),
    columns: { id: true },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const d = parsed.data;

  if (d.clear) {
    await db.update(items).set({ heroAttachmentId: null }).where(eq(items.id, id));
    return NextResponse.json({ heroAttachmentId: null });
  }

  // Use an existing attachment as the cover.
  if (d.attachmentId) {
    const att = await db.query.attachments.findFirst({
      where: and(eq(attachments.id, d.attachmentId), eq(attachments.itemId, id)),
      columns: { id: true, mimeType: true },
    });
    if (!att || !att.mimeType.startsWith("image/")) {
      return NextResponse.json({ error: "Not an image of this item" }, { status: 400 });
    }
    await db.update(items).set({ heroAttachmentId: att.id }).where(eq(items.id, id));
    return NextResponse.json({ heroAttachmentId: att.id });
  }

  // Download a web image (SSRF-guarded) and make it the cover.
  if (d.download) {
    const img = await downloadImage(d.download.url);
    if (!img) return NextResponse.json({ error: "Could not fetch that image" }, { status: 400 });
    const saved = await saveBuffer(id, img.fileName, img.buffer);
    const [created] = await db
      .insert(attachments)
      .values({
        itemId: id,
        kind: "image",
        source: "web",
        fileName: img.fileName,
        mimeType: img.mimeType,
        sizeBytes: saved.sizeBytes,
        storageKey: saved.storageKey,
        sourceUrl: d.download.sourceUrl ?? null,
        sourceTitle: d.download.attribution ?? null,
      })
      .returning({ id: attachments.id });
    await db.update(items).set({ heroAttachmentId: created.id }).where(eq(items.id, id));
    return NextResponse.json({ heroAttachmentId: created.id });
  }

  return NextResponse.json({ error: "Nothing to do" }, { status: 400 });
}
