import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { items } from "@/lib/db/schema";
import { getApprovedUserOrNull } from "@/lib/auth-guard";
import { hasAnthropic } from "@/lib/ai/anthropic";
import { answerAboutItem } from "@/lib/ai/agent";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  message: z.string().min(1).max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(8000),
      })
    )
    .max(20)
    .optional(),
});

// Multi-turn chat grounded in a single item's stored data.
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

  if (!hasAnthropic()) {
    return NextResponse.json(
      { error: "AI chat is not configured (no ANTHROPIC_API_KEY).", aiDisabled: true },
      { status: 400 }
    );
  }

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const result = await answerAboutItem(
      user.id,
      id,
      parsed.data.message,
      parsed.data.history ?? []
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error("item chat failed:", err);
    const detail = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: `Chat failed (${detail}).` }, { status: 500 });
  }
}
