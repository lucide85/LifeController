import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { captures, items } from "@/lib/db/schema";
import { getApprovedUserOrNull } from "@/lib/auth-guard";
import { processUpload } from "@/lib/ingest/process";
import { fetchUrlContent } from "@/lib/ingest/url";
import { embed } from "@/lib/ai/embeddings";
import { nearestItemsByVector } from "@/lib/ai/search";
import { classifyAndRoute, type CaptureSuggestion } from "@/lib/ai/ingest";

export const runtime = "nodejs";
export const maxDuration = 120;

function deriveTitle(parts: (string | null | undefined)[]): string {
  for (const p of parts) {
    const s = (p ?? "").trim();
    if (s) return s.slice(0, 120);
  }
  return "Untitled";
}

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

  let kind: "text" | "url" | "file" = "text";
  let rawText: string | null = null;
  let sourceUrl: string | null = null;
  let sourceTitle: string | null = null;
  let fileName: string | null = null;
  let mimeType: string | null = null;
  let sizeBytes = 0;
  let storageKey: string | null = null;
  let imageUrl: string | null = null;
  let extractedText = "";
  let embedding: number[] | null = null;

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
      kind = "file";
      fileName = file.name;
      mimeType = file.type || "application/octet-stream";
      const buffer = Buffer.from(await file.arrayBuffer());
      const processed = await processUpload({
        prefix: "_inbox",
        fileName: file.name,
        mimeType,
        buffer,
      });
      storageKey = processed.storageKey;
      sizeBytes = processed.sizeBytes;
      extractedText = processed.extractedText;
      embedding = processed.embedding;
    } else {
      const body = await req.json().catch(() => ({}));
      const urlInput = typeof body.url === "string" ? body.url.trim() : "";
      const textInput = typeof body.text === "string" ? body.text.trim() : "";

      if (urlInput) {
        kind = "url";
        const content = await fetchUrlContent(urlInput); // throws on invalid/SSRF/too-large
        sourceUrl = content.canonicalUrl;
        sourceTitle = content.title;
        imageUrl = content.imageUrl;
        extractedText = [content.title, content.description, content.text]
          .filter(Boolean)
          .join("\n\n");
        embedding = extractedText ? await embed(extractedText) : null;
      } else if (textInput) {
        kind = "text";
        rawText = textInput.slice(0, 20000);
        extractedText = rawText;
        embedding = await embed(rawText);
      } else {
        return NextResponse.json({ error: "Provide a file, url or text." }, { status: 400 });
      }
    }
  } catch (err) {
    console.error("capture intake failed:", err);
    const detail = err instanceof Error ? err.message : "could not read that";
    return NextResponse.json({ error: detail }, { status: 400 });
  }

  // Insert the capture first (fast), then attach the triage proposal.
  const [created] = await db
    .insert(captures)
    .values({
      ownerId: user.id,
      status: "inbox",
      kind,
      rawText,
      sourceUrl,
      sourceTitle,
      fileName,
      mimeType,
      sizeBytes,
      storageKey,
      imageUrl,
      extractedText: extractedText || null,
      embedding,
    })
    .returning({ id: captures.id });

  // AI triage (best-effort): candidates from similarity + the owner's categories.
  let suggestion: CaptureSuggestion | null = null;
  try {
    const candidates = embedding ? await nearestItemsByVector(user.id, embedding, 5) : [];
    const cats = await db
      .selectDistinct({ category: items.category })
      .from(items)
      .where(eq(items.ownerId, user.id));
    suggestion = await classifyAndRoute({
      text: extractedText || rawText || "",
      kind,
      sourceTitle,
      candidates,
      categories: cats.map((c) => c.category),
    });
  } catch (err) {
    console.error("capture triage failed:", err);
  }

  // Fallback when AI is off/failed: propose creating a new item.
  if (!suggestion) {
    suggestion = {
      action: "create",
      targetItemId: null,
      title: deriveTitle([sourceTitle, fileName, extractedText, rawText]),
      category: "general",
      summary: null,
      tags: [],
      fields: {},
      confidence: 0,
      candidates: [],
    };
  }

  await db
    .update(captures)
    .set({ suggestedAction: suggestion as unknown as Record<string, unknown> })
    .where(eq(captures.id, created.id));

  return NextResponse.json({ id: created.id, suggestion }, { status: 201 });
}
