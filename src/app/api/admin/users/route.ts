import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getApprovedUserOrNull } from "@/lib/auth-guard";

export const runtime = "nodejs";

// List all users (admin only).
export async function GET() {
  const me = await getApprovedUserOrNull();
  if (!me || me.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      image: users.image,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
      approvedAt: users.approvedAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));
  return NextResponse.json({ users: rows });
}
