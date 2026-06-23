import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { items, suggestions } from "@/lib/db/schema";
import { requireApprovedUser } from "@/lib/auth-guard";
import { AppShell } from "@/components/app-shell";
import { SuggestionsList, type SuggestionView } from "@/components/suggestions-list";

export const dynamic = "force-dynamic";

export default async function SuggestionsPage() {
  const user = await requireApprovedUser();

  let view: SuggestionView[] = [];
  try {
    const rows = await db
      .select({
        id: suggestions.id,
        kind: suggestions.kind,
        itemId: suggestions.itemId,
        relatedItemId: suggestions.relatedItemId,
        relation: suggestions.relation,
        fieldKey: suggestions.fieldKey,
        proposedValue: suggestions.proposedValue,
        title: suggestions.title,
        detail: suggestions.detail,
        confidence: suggestions.confidence,
      })
      .from(suggestions)
      .where(and(eq(suggestions.ownerId, user.id), eq(suggestions.status, "pending")))
      .orderBy(desc(suggestions.createdAt))
      .limit(100);

    // Resolve item titles (subject + related) for display in one query.
    const ids = Array.from(
      new Set(rows.flatMap((r) => [r.itemId, r.relatedItemId].filter(Boolean) as string[]))
    );
    const titleRows = ids.length
      ? await db
          .select({ id: items.id, title: items.title, category: items.category })
          .from(items)
          .where(and(eq(items.ownerId, user.id), inArray(items.id, ids)))
      : [];
    const byId = new Map(titleRows.map((t) => [t.id, t]));

    view = rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      itemId: r.itemId,
      itemTitle: byId.get(r.itemId)?.title ?? "(deleted item)",
      relatedItemId: r.relatedItemId,
      relatedItemTitle: r.relatedItemId ? (byId.get(r.relatedItemId)?.title ?? null) : null,
      relation: r.relation,
      fieldKey: r.fieldKey,
      proposedValue: r.proposedValue,
      title: r.title,
      detail: r.detail,
      confidence: r.confidence,
    }));
  } catch {
    // Table may not exist yet (migration 0006 not applied) — show the empty state.
    view = [];
  }

  return (
    <AppShell user={user}>
      <SuggestionsList initial={view} />
    </AppShell>
  );
}
