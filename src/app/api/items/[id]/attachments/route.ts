import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { items, attachments } from "@/lib/db/schema";
import { getApprovedUserOrNull } from "@/lib/auth-guard";
import { saveBuffer } from "@/lib/storage";
import { extractText } from "@/lib/ai/extract";
import { embed } from "@/lib/ai/embeddings";

export const runtime = "nodejs";
export const maxDuration = 120;

function kindFor(mime: string, hint?: string): "file" | "receipt" | "image" | "document" | "manual" {
  if (hint && ["file", "receipt", "image", "document", "manual"].includes(hint))
    return hint as any;
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "document";
  return "file";
}

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

  const form = await req.formData();
  const file = form.get("file");
  const kindHint = form.get("kind")?.toString();

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const maxMb = Number(process.env.MAX_UPLOAD_MB ?? 25);
  if (file.size > maxMb * 1024 * 1024) {
    return NextResponse.json({ error: `File exceeds ${maxMb}MB` }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = file.type || "application/octet-stream";

  const { storageKey, sizeBytes } = await saveBuffer(id, file.name, buffer);

  // Extract searchable text + embed it (best-effort; never blocks the upload).
  let extractedText = "";
  let embedding: number[] | null = null;
  try {
    extractedText = await extractText(buffer, mime, file.name);
    if (extractedText) {
      embedding = await embed(`${file.name}\n${extractedText}`);
    }
  } catch (err) {
    console.error("attachment processing failed:", err);
  }

  const [created] = await db
    .insert(attachments)
    .values({
      itemId: id,
      kind: kindFor(mime, kindHint),
      source: "upload",
      fileName: file.name,
      mimeType: mime,
      sizeBytes,
      storageKey,
      extractedText: extractedText || null,
      embedding,
    })
    .returning();

  await db.update(items).set({ updatedAt: new Date() }).where(eq(items.id, id));

  return NextResponse.json({ attachment: created }, { status: 201 });
}
