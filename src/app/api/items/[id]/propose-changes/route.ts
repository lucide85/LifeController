import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { items } from "@/lib/db/schema";
import { getApprovedUserOrNull } from "@/lib/auth-guard";
import { hasAnthropic } from "@/lib/ai/anthropic";
import { itemEmbedText } from "@/lib/ai/embeddings";
import { proposeFieldChanges } from "@/lib/ai/writeback";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  sourceText: z.string().min(1).max(20000),
  source: z.enum(["chat", "web", "manual", "ai", "upload"]).default("chat"),
});

// Read-only: propose spec-field changes extracted from some source text. Applying
// is a separate, explicit step (apply-changes).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getApprovedUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasAnthropic()) {
    return NextResponse.json({ error: "AI is not configured." }, { status: 400 });
  }
  const { id } = await params;

  const item = await db.query.items.findFirst({
    where: and(eq(items.id, id), eq(items.ownerId, user.id)),
    columns: { embedding: false },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const ops = await proposeFieldChanges({
      itemContext: itemEmbedText(item),
      currentFields: item.fields ?? {},
      sourceText: parsed.data.sourceText,
    });
    return NextResponse.json({ ops });
  } catch (err) {
    console.error("propose-changes failed:", err);
    const detail = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: `Could not extract facts (${detail}).` }, { status: 500 });
  }
}
