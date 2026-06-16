import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { requireApprovedUser } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { items } from "@/lib/db/schema";
import { relatedItems } from "@/lib/ai/search";
import { AppShell } from "@/components/app-shell";
import { ItemDetail } from "@/components/item-detail";

export const dynamic = "force-dynamic";

export default async function ItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireApprovedUser();
  const { id } = await params;

  const item = await db.query.items.findFirst({
    where: and(eq(items.id, id), eq(items.ownerId, user.id)),
    with: {
      attachments: { columns: { embedding: false } },
      notes: { columns: { embedding: false } },
      tasks: true,
    },
  });

  if (!item) notFound();

  // Nearest items by embedding (best-effort: empty if AI/embeddings are off).
  const related = await relatedItems(user.id, item.id, 6).catch(() => []);

  // Serialize dates for the client component.
  const serialized = {
    id: item.id,
    title: item.title,
    category: item.category,
    description: item.description,
    location: item.location,
    tags: item.tags ?? [],
    fields: item.fields ?? {},
    summaryMd: item.summaryMd ?? null,
    summaryAtAGlance: item.summaryAtAGlance ?? null,
    summaryUpdatedAt: item.summaryUpdatedAt ? item.summaryUpdatedAt.toISOString() : null,
    layout: item.layout ?? "generic",
    fieldsMeta: item.fieldsMeta ?? {},
    updatedAt: item.updatedAt.toISOString(),
    attachments: item.attachments
      .map((a) => ({
        id: a.id,
        taskId: a.taskId,
        kind: a.kind,
        source: a.source,
        fileName: a.fileName,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        sourceUrl: a.sourceUrl,
        sourceTitle: a.sourceTitle,
        createdAt: a.createdAt.toISOString(),
      }))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    notes: item.notes
      .map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt.toISOString() }))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    tasks: item.tasks
      .map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        dueDate: t.dueDate ? t.dueDate.toISOString() : null,
        completedAt: t.completedAt ? t.completedAt.toISOString() : null,
        cost: t.cost,
        recurrenceMonths: t.recurrenceMonths,
        recurrenceNote: t.recurrenceNote,
        source: t.source,
        createdAt: t.createdAt.toISOString(),
      }))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    related: related.map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      location: r.location,
    })),
  };

  return (
    <AppShell user={user}>
      <ItemDetail item={serialized} />
    </AppShell>
  );
}
