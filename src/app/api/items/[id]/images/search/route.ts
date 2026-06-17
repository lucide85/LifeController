import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { items } from "@/lib/db/schema";
import { getApprovedUserOrNull } from "@/lib/auth-guard";
import { searchCommons } from "@/lib/images/commons";

export const runtime = "nodejs";
export const maxDuration = 30;

// Search Wikimedia Commons for a cover-image candidate for this item.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getApprovedUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const item = await db.query.items.findFirst({
    where: and(eq(items.id, id), eq(items.ownerId, user.id)),
    columns: { title: true, category: true },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const q = (req.nextUrl.searchParams.get("q") || item.title).trim();
  try {
    const images = await searchCommons(q, 6);
    return NextResponse.json({ images, query: q });
  } catch (err) {
    console.error("commons search route failed:", err);
    return NextResponse.json({ images: [], query: q });
  }
}
