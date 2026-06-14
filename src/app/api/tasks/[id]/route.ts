import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { items, maintenanceTasks, attachments } from "@/lib/db/schema";
import { getApprovedUserOrNull } from "@/lib/auth-guard";
import { deleteStored } from "@/lib/storage";

export const runtime = "nodejs";

// Load a task only if it belongs to the current user (via its item).
async function ownTask(userId: string, taskId: string) {
  const rows = await db
    .select({ task: maintenanceTasks, ownerId: items.ownerId })
    .from(maintenanceTasks)
    .innerJoin(items, eq(maintenanceTasks.itemId, items.id))
    .where(eq(maintenanceTasks.id, taskId))
    .limit(1);
  const row = rows[0];
  if (!row || row.ownerId !== userId) return null;
  return row.task;
}

const patchSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(8000).nullable().optional(),
  status: z.enum(["planned", "done"]).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  cost: z.string().max(120).nullable().optional(),
  recurrenceMonths: z.number().int().positive().max(600).nullable().optional(),
  recurrenceNote: z.string().max(200).nullable().optional(),
});

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getApprovedUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await ownTask(user.id, id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  const becomingDone = d.status === "done" && existing.status !== "done";
  const completedAt = becomingDone
    ? d.completedAt
      ? new Date(d.completedAt)
      : new Date()
    : d.completedAt !== undefined
      ? d.completedAt
        ? new Date(d.completedAt)
        : null
      : existing.completedAt;

  const recurrenceMonths =
    d.recurrenceMonths !== undefined ? d.recurrenceMonths : existing.recurrenceMonths;

  const [updated] = await db
    .update(maintenanceTasks)
    .set({
      title: d.title ?? existing.title,
      description: d.description !== undefined ? d.description : existing.description,
      status: d.status ?? existing.status,
      dueDate:
        d.dueDate !== undefined ? (d.dueDate ? new Date(d.dueDate) : null) : existing.dueDate,
      completedAt,
      cost: d.cost !== undefined ? d.cost : existing.cost,
      recurrenceMonths,
      recurrenceNote: d.recurrenceNote !== undefined ? d.recurrenceNote : existing.recurrenceNote,
      updatedAt: new Date(),
    })
    .where(eq(maintenanceTasks.id, id))
    .returning();

  // If a recurring task was just completed, schedule the next occurrence.
  let nextTask = null;
  if (becomingDone && recurrenceMonths && recurrenceMonths > 0) {
    const base = completedAt ?? new Date();
    [nextTask] = await db
      .insert(maintenanceTasks)
      .values({
        itemId: existing.itemId,
        title: existing.title,
        description: existing.description,
        status: "planned",
        dueDate: addMonths(base, recurrenceMonths),
        recurrenceMonths,
        recurrenceNote: existing.recurrenceNote,
        source: existing.source,
      })
      .returning();
  }

  return NextResponse.json({ task: updated, nextTask });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getApprovedUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await ownTask(user.id, id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Remove the task's attachments from disk first (DB rows cascade on delete).
  const atts = await db.query.attachments.findMany({ where: eq(attachments.taskId, id) });
  await Promise.all(atts.map((a) => deleteStored(a.storageKey)));

  await db.delete(maintenanceTasks).where(eq(maintenanceTasks.id, id));
  return NextResponse.json({ ok: true });
}
