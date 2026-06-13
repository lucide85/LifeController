import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { attachments, items } from "@/lib/db/schema";
import { getApprovedUserOrNull } from "@/lib/auth-guard";
import { deleteStored } from "@/lib/storage";

export const runtime = "nodejs";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getApprovedUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const row = await db
    .select({
      id: attachments.id,
      storageKey: attachments.storageKey,
      ownerId: items.ownerId,
    })
    .from(attachments)
    .innerJoin(items, eq(attachments.itemId, items.id))
    .where(eq(attachments.id, id))
    .limit(1);

  const att = row[0];
  if (!att || att.ownerId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await deleteStored(att.storageKey);
  await db.delete(attachments).where(eq(attachments.id, id));
  return NextResponse.json({ ok: true });
}
