import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getApprovedUserOrNull } from "@/lib/auth-guard";
import { answerFromLibrary } from "@/lib/ai/agent";
import { hasAnthropic } from "@/lib/ai/anthropic";
import { retrieve } from "@/lib/ai/search";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({ q: z.string().min(1).max(2000) });

// Ask the AI agent a question about your library.
export async function POST(req: NextRequest) {
  const user = await getApprovedUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  // No Claude key configured → return raw retrieval results without an answer.
  if (!hasAnthropic()) {
    const chunks = await retrieve(user.id, parsed.data.q, 10);
    return NextResponse.json({
      answer:
        "AI answering is not configured (no ANTHROPIC_API_KEY). Showing matching entries from your library.",
      found: chunks.length > 0,
      sources: chunks,
      aiDisabled: true,
    });
  }

  const result = await answerFromLibrary(user.id, parsed.data.q);
  return NextResponse.json(result);
}
