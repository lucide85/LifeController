import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { items, maintenanceTasks } from "@/lib/db/schema";
import { getApprovedUserOrNull } from "@/lib/auth-guard";

export const runtime = "nodejs";

const createSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(8000).optional(),
  status: z.enum(["planned", "done"]).default("planned"),
  dueDate: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  cost: z.string().max(120).nullable().optional(),
  recurrenceMonths: z.number().int().positive().max(600).nullable().optional(),
  recurrenceNote: z.string().max(200).nullable().optional(),
  source: z.enum(["user", "manual", "web"]).default("user"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getApprovedUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const item = await db.query.items.findFirst({
    where: and(eq(items.id, id), eq(items.ownerId, user.id)),
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  const done = d.status === "done";

  const [created] = await db
    .insert(maintenanceTasks)
    .values({
      itemId: id,
      title: d.title,
      description: d.description ?? null,
      status: d.status,
      dueDate: d.dueDate ? new Date(d.dueDate) : null,
      completedAt: done ? (d.completedAt ? new Date(d.completedAt) : new Date()) : null,
      cost: d.cost ?? null,
      recurrenceMonths: d.recurrenceMonths ?? null,
      recurrenceNote: d.recurrenceNote ?? null,
      source: d.source,
    })
    .returning();

  return NextResponse.json({ task: created }, { status: 201 });
}
