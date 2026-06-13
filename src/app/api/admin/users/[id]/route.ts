import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getApprovedUserOrNull } from "@/lib/auth-guard";

export const runtime = "nodejs";

const schema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  role: z.enum(["user", "admin"]).optional(),
});

// Approve / reject / change role of a user (admin only).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await getApprovedUserOrNull();
  if (!me || me.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { status, role } = parsed.data;

  const target = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [updated] = await db
    .update(users)
    .set({
      ...(status ? { status, approvedAt: status === "approved" ? new Date() : null, approvedBy: me.id } : {}),
      ...(role ? { role } : {}),
    })
    .where(eq(users.id, id))
    .returning();

  return NextResponse.json({ user: updated });
}
