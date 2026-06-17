import { NextRequest, NextResponse } from "next/server";
import { and, eq, or, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { items, itemLinks } from "@/lib/db/schema";
import { getApprovedUserOrNull } from "@/lib/auth-guard";

export const runtime = "nodejs";

// NOTE: a Next.js route file may only export the HTTP handlers + recognised config
// (runtime, maxDuration, …). This must stay a LOCAL const — exporting it makes the
// build fail with "X is not a valid Route export field".
const RELATIONS = [
  "related",
  "part-of",
  "stored-in",
  "covers",
  "accessory-of",
  "replaces",
] as const;

// List confirmed links involving this item (in either direction).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getApprovedUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const rows = await db
    .select({
      id: itemLinks.id,
      relation: itemLinks.relation,
      origin: itemLinks.origin,
      fromItemId: itemLinks.fromItemId,
      toItemId: itemLinks.toItemId,
    })
    .from(itemLinks)
    .where(
      and(
        eq(itemLinks.ownerId, user.id),
        or(eq(itemLinks.fromItemId, id), eq(itemLinks.toItemId, id))
      )
    );

  // Resolve the "other" item for each link for display.
  const otherIds = Array.from(
    new Set(rows.map((r) => (r.fromItemId === id ? r.toItemId : r.fromItemId)))
  );
  const others = otherIds.length
    ? await db
        .select({ id: items.id, title: items.title, category: items.category })
        .from(items)
        .where(and(eq(items.ownerId, user.id), inArray(items.id, otherIds)))
    : [];
  const byId = new Map(others.map((o) => [o.id, o]));

  const links = rows
    .map((r) => {
      const otherId = r.fromItemId === id ? r.toItemId : r.fromItemId;
      const other = byId.get(otherId);
      if (!other) return null;
      return {
        id: r.id,
        relation: r.relation,
        origin: r.origin,
        outgoing: r.fromItemId === id,
        other,
      };
    })
    .filter(Boolean);

  return NextResponse.json({ links });
}

const createSchema = z.object({
  toItemId: z.string().uuid(),
  relation: z.enum(RELATIONS).default("related"),
});

// Create a confirmed link from this item to another of the owner's items.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getApprovedUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { toItemId, relation } = parsed.data;
  if (toItemId === id) {
    return NextResponse.json({ error: "Cannot link an item to itself" }, { status: 400 });
  }

  // Both endpoints must belong to the owner.
  const owned = await db
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.ownerId, user.id), or(eq(items.id, id), eq(items.id, toItemId))));
  if (owned.length !== 2) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const [created] = await db
    .insert(itemLinks)
    .values({ ownerId: user.id, fromItemId: id, toItemId, relation, origin: "user" })
    .onConflictDoNothing()
    .returning({ id: itemLinks.id });

  return NextResponse.json({ ok: true, id: created?.id ?? null }, { status: 201 });
}
