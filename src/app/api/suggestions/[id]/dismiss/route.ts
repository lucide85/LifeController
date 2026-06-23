import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { suggestions } from "@/lib/db/schema";
import { getApprovedUserOrNull } from "@/lib/auth-guard";

export const runtime = "nodejs";

// Dismiss a pending suggestion. The row stays (status=dismissed) so the periodic
// scan won't re-propose it via its dedupe key.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getApprovedUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  await db
    .update(suggestions)
    .set({ status: "dismissed", resolvedAt: new Date() })
    .where(
      and(
        eq(suggestions.id, id),
        eq(suggestions.ownerId, user.id),
        eq(suggestions.status, "pending")
      )
    );

  return NextResponse.json({ ok: true });
}
