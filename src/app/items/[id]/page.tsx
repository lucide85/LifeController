import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { requireApprovedUser } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { items } from "@/lib/db/schema";
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
    },
  });

  if (!item) notFound();

  // Serialize dates for the client component.
  const serialized = {
    id: item.id,
    title: item.title,
    category: item.category,
    description: item.description,
    location: item.location,
    tags: item.tags ?? [],
    fields: item.fields ?? {},
    updatedAt: item.updatedAt.toISOString(),
    attachments: item.attachments
      .map((a) => ({
        id: a.id,
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
  };

  return (
    <AppShell user={user}>
      <ItemDetail item={serialized} />
    </AppShell>
  );
}
