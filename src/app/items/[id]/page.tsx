import { notFound } from "next/navigation";
import { and, desc, eq, or, inArray } from "drizzle-orm";
import { requireApprovedUser } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { items, factRevisions, itemLinks } from "@/lib/db/schema";
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

  // Provenance: the latest recorded source per spec field ("why is this here?").
  const revisions = await db
    .select({
      fieldKey: factRevisions.fieldKey,
      source: factRevisions.source,
      sourceUrl: factRevisions.sourceUrl,
    })
    .from(factRevisions)
    .where(eq(factRevisions.itemId, item.id))
    .orderBy(desc(factRevisions.createdAt))
    .limit(300);
  const fieldSources: Record<string, { source: string; sourceUrl: string | null }> = {};
  for (const r of revisions) {
    if (!fieldSources[r.fieldKey]) {
      fieldSources[r.fieldKey] = { source: r.source, sourceUrl: r.sourceUrl };
    }
  }

  // Cover image: only if the referenced attachment still exists on this item.
  const heroImageId =
    item.heroAttachmentId && item.attachments.some((a) => a.id === item.heroAttachmentId)
      ? item.heroAttachmentId
      : null;

  // Confirmed cross-item links (either direction), with the other item resolved.
  const linkRows = await db
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
        or(eq(itemLinks.fromItemId, item.id), eq(itemLinks.toItemId, item.id))
      )
    );
  const otherIds = Array.from(
    new Set(linkRows.map((r) => (r.fromItemId === item.id ? r.toItemId : r.fromItemId)))
  );
  const others = otherIds.length
    ? await db
        .select({ id: items.id, title: items.title, category: items.category })
        .from(items)
        .where(and(eq(items.ownerId, user.id), inArray(items.id, otherIds)))
    : [];
  const otherById = new Map(others.map((o) => [o.id, o]));
  const links = linkRows
    .map((r) => {
      const otherId = r.fromItemId === item.id ? r.toItemId : r.fromItemId;
      const other = otherById.get(otherId);
      if (!other) return null;
      return { id: r.id, relation: r.relation, origin: r.origin, outgoing: r.fromItemId === item.id, other };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);

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
    fieldSources,
    heroImageId,
    links,
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
