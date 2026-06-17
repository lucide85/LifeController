import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { itemLinks } from "@/lib/db/schema";
import { getApprovedUserOrNull } from "@/lib/auth-guard";

export const runtime = "nodejs";

// Remove a confirmed cross-item link (owner-scoped).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getApprovedUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  await db
    .delete(itemLinks)
    .where(and(eq(itemLinks.id, id), eq(itemLinks.ownerId, user.id)));

  return NextResponse.json({ ok: true });
}
