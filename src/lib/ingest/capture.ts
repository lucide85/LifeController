// Shared capture intake: turn a dropped file / pasted URL / pasted text into a
// staged `captures` row with extracted text + embedding, then run AI triage to
// propose how to file it. Used by both the HTTP capture route and the Telegram
// bot, so the two stay in lock-step. Throws on bad input (e.g. URL fetch/SSRF
// failure) — callers map that to a 4xx / a friendly reply.
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { captures, items } from "@/lib/db/schema";
import { processUpload } from "@/lib/ingest/process";
import { fetchUrlContent } from "@/lib/ingest/url";
import { embed } from "@/lib/ai/embeddings";
import { nearestItemsByVector } from "@/lib/ai/search";
import { classifyAndRoute, type CaptureSuggestion } from "@/lib/ai/ingest";

export interface CaptureInput {
  ownerId: string;
  file?: { buffer: Buffer; fileName: string; mimeType: string };
  url?: string;
  text?: string;
}

function deriveTitle(parts: (string | null | undefined)[]): string {
  for (const p of parts) {
    const s = (p ?? "").trim();
    if (s) return s.slice(0, 120);
  }
  return "Untitled";
}

export async function ingestCapture(
  input: CaptureInput
): Promise<{ id: string; suggestion: CaptureSuggestion }> {
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

  if (input.file) {
    kind = "file";
    fileName = input.file.fileName;
    mimeType = input.file.mimeType || "application/octet-stream";
    const processed = await processUpload({
      prefix: "_inbox",
      fileName: input.file.fileName,
      mimeType,
      buffer: input.file.buffer,
    });
    storageKey = processed.storageKey;
    sizeBytes = processed.sizeBytes;
    extractedText = processed.extractedText;
    embedding = processed.embedding;
  } else if (input.url && input.url.trim()) {
    kind = "url";
    const content = await fetchUrlContent(input.url.trim()); // throws on invalid/SSRF/too-large
    sourceUrl = content.canonicalUrl;
    sourceTitle = content.title;
    imageUrl = content.imageUrl;
    extractedText = [content.title, content.description, content.text].filter(Boolean).join("\n\n");
    embedding = extractedText ? await embed(extractedText) : null;
  } else if (input.text && input.text.trim()) {
    kind = "text";
    rawText = input.text.trim().slice(0, 20000);
    extractedText = rawText;
    embedding = await embed(rawText);
  } else {
    throw new Error("Provide a file, url or text.");
  }

  const [created] = await db
    .insert(captures)
    .values({
      ownerId: input.ownerId,
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
    const candidates = embedding ? await nearestItemsByVector(input.ownerId, embedding, 5) : [];
    const cats = await db
      .selectDistinct({ category: items.category })
      .from(items)
      .where(eq(items.ownerId, input.ownerId));
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
    .where(and(eq(captures.id, created.id), eq(captures.ownerId, input.ownerId)));

  return { id: created.id, suggestion };
}

// A short human-readable line describing what triage proposed (for bot replies).
export function describeSuggestion(s: CaptureSuggestion): string {
  if (s.action === "attach" && s.targetItemId) {
    const t = s.candidates.find((c) => c.id === s.targetItemId)?.title;
    return t ? `attach to “${t}”` : "attach to an existing item";
  }
  return `create “${s.title ?? "Untitled"}”${s.category ? ` (${s.category})` : ""}`;
}
