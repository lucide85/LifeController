import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { requireApprovedUser } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { items, maintenanceTasks } from "@/lib/db/schema";
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

  // Upcoming & overdue planned maintenance across all of the user's items.
  const reminderRows = await db
    .select({
      id: maintenanceTasks.id,
      itemId: maintenanceTasks.itemId,
      title: maintenanceTasks.title,
      dueDate: maintenanceTasks.dueDate,
      itemTitle: items.title,
    })
    .from(maintenanceTasks)
    .innerJoin(items, eq(maintenanceTasks.itemId, items.id))
    .where(
      and(
        eq(items.ownerId, user.id),
        eq(maintenanceTasks.status, "planned"),
        isNotNull(maintenanceTasks.dueDate)
      )
    )
    .orderBy(asc(maintenanceTasks.dueDate))
    .limit(25);

  return (
    <AppShell user={user}>
      <LibraryView
        items={rows.map((r) => ({
          ...r,
          updatedAt: r.updatedAt.toISOString(),
        }))}
        reminders={reminderRows.map((r) => ({
          id: r.id,
          itemId: r.itemId,
          itemTitle: r.itemTitle,
          title: r.title,
          dueDate: r.dueDate!.toISOString(),
        }))}
        userName={user.name ?? undefined}
      />
    </AppShell>
  );
}
