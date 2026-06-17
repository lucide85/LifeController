import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { captures } from "@/lib/db/schema";
import { getApprovedUserOrNull } from "@/lib/auth-guard";
import { ingestCapture } from "@/lib/ingest/capture";

export const runtime = "nodejs";
export const maxDuration = 120;

// List inbox captures.
export async function GET(req: NextRequest) {
  const user = await getApprovedUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const status = (req.nextUrl.searchParams.get("status") ?? "inbox") as
    | "inbox"
    | "filed"
    | "discarded";

  const rows = await db
    .select({
      id: captures.id,
      status: captures.status,
      kind: captures.kind,
      rawText: captures.rawText,
      sourceUrl: captures.sourceUrl,
      sourceTitle: captures.sourceTitle,
      fileName: captures.fileName,
      mimeType: captures.mimeType,
      imageUrl: captures.imageUrl,
      extractedText: captures.extractedText,
      suggestedAction: captures.suggestedAction,
      createdAt: captures.createdAt,
    })
    .from(captures)
    .where(and(eq(captures.ownerId, user.id), eq(captures.status, status)))
    .orderBy(desc(captures.createdAt))
    .limit(100);

  return NextResponse.json({
    captures: rows.map((r) => ({
      ...r,
      extractedText: r.extractedText ? r.extractedText.slice(0, 600) : null,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

// Create a capture from a dropped file, a pasted URL, or pasted text, then run AI
// triage synchronously so the inbox card shows a proposal immediately.
export async function POST(req: NextRequest) {
  const user = await getApprovedUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contentType = req.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }
      const maxMb = Number(process.env.MAX_UPLOAD_MB ?? 25);
      if (file.size > maxMb * 1024 * 1024) {
        return NextResponse.json({ error: `File exceeds ${maxMb}MB` }, { status: 413 });
      }
      const result = await ingestCapture({
        ownerId: user.id,
        file: {
          buffer: Buffer.from(await file.arrayBuffer()),
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
        },
      });
      return NextResponse.json(result, { status: 201 });
    }

    const body = await req.json().catch(() => ({}));
    const url: string = typeof body.url === "string" ? body.url.trim() : "";
    const text: string = typeof body.text === "string" ? body.text.trim() : "";
    if (!url && !text) {
      return NextResponse.json({ error: "Provide a file, url or text." }, { status: 400 });
    }
    const result = await ingestCapture({ ownerId: user.id, url: url || undefined, text: text || undefined });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error("capture intake failed:", err);
    const detail = err instanceof Error ? err.message : "could not read that";
    return NextResponse.json({ error: detail }, { status: 400 });
  }
}
