import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { items, attachments } from "@/lib/db/schema";
import { getApprovedUserOrNull } from "@/lib/auth-guard";
import { readStored } from "@/lib/storage";
import { extractText } from "@/lib/ai/extract";
import { embed } from "@/lib/ai/embeddings";

export const runtime = "nodejs";
export const maxDuration = 120;

// Re-run text extraction (and re-embed) for an already-uploaded file. Useful when
// a scanned PDF was stored before the Claude OCR fallback existed, so the user can
// make it searchable / auto-fillable without re-uploading.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getApprovedUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  // Ownership: the attachment must belong to an item owned by this user.
  const [row] = await db
    .select({ att: attachments })
    .from(attachments)
    .innerJoin(items, eq(attachments.itemId, items.id))
    .where(and(eq(attachments.id, id), eq(items.ownerId, user.id)))
    .limit(1);

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const att = row.att;

  let extractedText = "";
  try {
    const buffer = await readStored(att.storageKey);
    extractedText = await extractText(buffer, att.mimeType, att.fileName);
  } catch (err) {
    console.error("re-extract failed for", att.fileName, err);
    return NextResponse.json({ error: "Could not read the stored file." }, { status: 500 });
  }

  if (!extractedText) {
    return NextResponse.json(
      { error: "Still no readable text could be extracted from that file." },
      { status: 422 }
    );
  }

  let embedding: number[] | null = null;
  try {
    embedding = await embed(`${att.fileName}\n${extractedText}`);
  } catch (err) {
    console.error("re-embed failed for", att.fileName, err);
  }

  await db
    .update(attachments)
    .set({ extractedText, ...(embedding ? { embedding } : {}) })
    .where(eq(attachments.id, id));

  return NextResponse.json({ ok: true, chars: extractedText.length });
}
