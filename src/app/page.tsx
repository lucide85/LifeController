import { desc, eq } from "drizzle-orm";
import { requireApprovedUser } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { items } from "@/lib/db/schema";
import { AppShell } from "@/components/app-shell";
import { LibraryView } from "@/components/library-view";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireApprovedUser();

  const rows = await db
    .select({
      id: items.id,
      title: items.title,
      category: items.category,
      description: items.description,
      location: items.location,
      tags: items.tags,
      updatedAt: items.updatedAt,
    })
    .from(items)
    .where(eq(items.ownerId, user.id))
    .orderBy(desc(items.updatedAt));

  return (
    <AppShell user={user}>
      <LibraryView
        items={rows.map((r) => ({
          ...r,
          updatedAt: r.updatedAt.toISOString(),
        }))}
        userName={user.name ?? undefined}
      />
    </AppShell>
  );
}
