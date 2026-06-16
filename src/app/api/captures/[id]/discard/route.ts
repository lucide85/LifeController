import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { captures } from "@/lib/db/schema";
import { getApprovedUserOrNull } from "@/lib/auth-guard";
import { deleteStored } from "@/lib/storage";

export const runtime = "nodejs";

// Discard an inbox capture (and clean up its unfiled file, if any).
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getApprovedUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const capture = await db.query.captures.findFirst({
    where: and(eq(captures.id, id), eq(captures.ownerId, user.id)),
    columns: { id: true, status: true, storageKey: true },
  });
  if (!capture) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Only clean up the file if it was never filed onto an item (still under _inbox/).
  if (capture.status === "inbox" && capture.storageKey?.startsWith("_inbox/")) {
    await deleteStored(capture.storageKey).catch(() => {});
  }

  await db.update(captures).set({ status: "discarded" }).where(eq(captures.id, id));
  return NextResponse.json({ ok: true });
}
