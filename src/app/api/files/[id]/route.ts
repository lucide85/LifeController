import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { attachments, items } from "@/lib/db/schema";
import { getApprovedUserOrNull } from "@/lib/auth-guard";
import { readStored } from "@/lib/storage";
import { getThumbnail } from "@/lib/thumbnail";

export const runtime = "nodejs";

// Streams an uploaded file, but only to its owner.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getApprovedUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const row = await db
    .select({
      storageKey: attachments.storageKey,
      mimeType: attachments.mimeType,
      fileName: attachments.fileName,
      ownerId: items.ownerId,
    })
    .from(attachments)
    .innerJoin(items, eq(attachments.itemId, items.id))
    .where(eq(attachments.id, id))
    .limit(1);

  const att = row[0];
  if (!att || att.ownerId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Thumbnail variant for galleries/grids: serve a small cached WebP instead of
  // the full-resolution original. Falls back to the original if generation fails.
  if (req.nextUrl.searchParams.get("variant") === "thumb") {
    const thumb = await getThumbnail(att.storageKey, att.mimeType);
    if (thumb) {
      return new NextResponse(thumb as unknown as BodyInit, {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "private, max-age=86400",
        },
      });
    }
  }

  try {
    const data = await readStored(att.storageKey);
    const disposition = req.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
    return new NextResponse(data as unknown as BodyInit, {
      headers: {
        "Content-Type": att.mimeType,
        "Content-Disposition": `${disposition}; filename="${encodeURIComponent(att.fileName)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "File missing on disk" }, { status: 404 });
  }
}
