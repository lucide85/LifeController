import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth-guard";
import { verifyAdminSecureCode } from "@/lib/settings";

export const runtime = "nodejs";

const schema = z.object({ code: z.string().min(1).max(512) });

// Break-glass admin access: a logged-in user who submits the secure code from
// settings.json is promoted to an approved admin.
export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!verifyAdminSecureCode(parsed.data.code)) {
    // Generic message — don't reveal whether a code is configured.
    return NextResponse.json({ error: "Invalid code" }, { status: 403 });
  }

  const [updated] = await db
    .update(users)
    .set({ role: "admin", status: "approved", approvedAt: new Date() })
    .where(eq(users.id, me.id))
    .returning();

  return NextResponse.json({ ok: true, user: { role: updated.role, status: updated.status } });
}
