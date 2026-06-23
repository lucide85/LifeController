// Build a short proactive "briefing" for the owner: upcoming/overdue maintenance,
// untriaged inbox items, a gently resurfaced neglected item, and recent activity.
// Composed by Claude into a friendly note when available, else a plain fallback.
import { and, asc, desc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { items, maintenanceTasks, captures, suggestions } from "@/lib/db/schema";
import { getAnthropic, getModel, hasAnthropic } from "@/lib/ai/anthropic";

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export async function buildDigest(ownerId: string): Promise<string | null> {
  const now = new Date();

  const [dueTasks, inboxCountRow, neglected, recentCountRow, pendingSuggRow] = await Promise.all([
    db
      .select({
        title: maintenanceTasks.title,
        dueDate: maintenanceTasks.dueDate,
        itemTitle: items.title,
      })
      .from(maintenanceTasks)
      .innerJoin(items, eq(maintenanceTasks.itemId, items.id))
      .where(
        and(
          eq(items.ownerId, ownerId),
          eq(maintenanceTasks.status, "planned"),
          isNotNull(maintenanceTasks.dueDate),
          lte(maintenanceTasks.dueDate, daysFromNow(30))
        )
      )
      .orderBy(asc(maintenanceTasks.dueDate))
      .limit(10),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(captures)
      .where(and(eq(captures.ownerId, ownerId), eq(captures.status, "inbox"))),
    db
      .select({ title: items.title, updatedAt: items.updatedAt })
      .from(items)
      .where(and(eq(items.ownerId, ownerId), lte(items.updatedAt, daysFromNow(-120))))
      .orderBy(asc(items.updatedAt))
      .limit(1),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(items)
      .where(and(eq(items.ownerId, ownerId), gte(items.createdAt, daysFromNow(-7)))),
    // Pending proactive suggestions. `.catch` so a not-yet-migrated table can't take
    // down the whole briefing (the rest of the digest still composes).
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(suggestions)
      .where(and(eq(suggestions.ownerId, ownerId), eq(suggestions.status, "pending")))
      .catch(() => [{ c: 0 }] as { c: number }[]),
  ]);

  const inboxCount = Number(inboxCountRow[0]?.c ?? 0);
  const recentCount = Number(recentCountRow[0]?.c ?? 0);
  const pendingSugg = Number(pendingSuggRow[0]?.c ?? 0);

  const overdue = dueTasks.filter((t) => t.dueDate && t.dueDate < now);
  const upcoming = dueTasks.filter((t) => t.dueDate && t.dueDate >= now);

  // Nothing worth pinging about.
  if (
    !dueTasks.length &&
    inboxCount === 0 &&
    !neglected.length &&
    recentCount === 0 &&
    pendingSugg === 0
  ) {
    return null;
  }

  const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
  const factLines: string[] = [];
  if (overdue.length)
    factLines.push(
      `OVERDUE maintenance: ${overdue.map((t) => `${t.title} (${t.itemTitle}, was due ${fmt(t.dueDate)})`).join("; ")}`
    );
  if (upcoming.length)
    factLines.push(
      `Upcoming maintenance: ${upcoming.map((t) => `${t.title} (${t.itemTitle}, due ${fmt(t.dueDate)})`).join("; ")}`
    );
  if (inboxCount) factLines.push(`${inboxCount} item(s) waiting in the capture inbox to be filed.`);
  if (pendingSugg)
    factLines.push(
      `${pendingSugg} suggestion(s) awaiting review (possible duplicates, links between items, or details to fill in).`
    );
  if (recentCount) factLines.push(`${recentCount} item(s) added in the last 7 days.`);
  if (neglected.length)
    factLines.push(
      `Resurfaced (untouched a while): "${neglected[0].title}" — last updated ${fmt(neglected[0].updatedAt)}.`
    );

  const facts = factLines.join("\n");

  if (!hasAnthropic()) {
    return `Your daily briefing\n\n${facts}`;
  }

  try {
    const res = await getAnthropic().messages.create({
      model: getModel(),
      max_tokens: 500,
      system:
        "You write a short, warm daily briefing for the owner of their personal life-library app. " +
        "Turn the facts into 4-8 friendly lines of plain text (no markdown headings, a couple of " +
        "emoji at most). Lead with anything overdue. End with a gentle nudge about the resurfaced " +
        "item if present. Do not invent anything beyond the facts.",
      messages: [{ role: "user", content: `Facts:\n${facts}` }],
    });
    const text = res.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
    return text || `Your daily briefing\n\n${facts}`;
  } catch (err) {
    console.error("digest compose failed:", err);
    return `Your daily briefing\n\n${facts}`;
  }
}
