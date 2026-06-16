import Link from "next/link";
import { and, eq, sql } from "drizzle-orm";
import { Library, Sparkles, Plus, Boxes, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserMenu } from "@/components/user-menu";
import { db } from "@/lib/db";
import { captures, type User } from "@/lib/db/schema";

async function inboxCount(userId: string): Promise<number> {
  try {
    const [row] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(captures)
      .where(and(eq(captures.ownerId, userId), eq(captures.status, "inbox")));
    return Number(row?.c ?? 0);
  } catch {
    // Table may not exist yet (migration not applied) — don't break every page.
    return 0;
  }
}

export async function AppShell({
  user,
  children,
}: {
  user: User;
  children: React.ReactNode;
}) {
  const pendingCaptures = await inboxCount(user.id);
  return (
    <div className="relative min-h-screen">
      <div className="aurora-bg" />
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <div className="brand-gradient flex h-8 w-8 items-center justify-center rounded-lg text-white shadow-lg shadow-primary/30">
              <Boxes className="h-5 w-5" />
            </div>
            <span className="hidden text-gradient sm:inline">LifeController</span>
          </Link>

          <nav className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link href="/">
                <Library /> <span className="hidden sm:inline">Library</span>
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/search">
                <Sparkles /> <span className="hidden sm:inline">Ask AI</span>
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="relative">
              <Link href="/inbox">
                <Inbox /> <span className="hidden sm:inline">Inbox</span>
                {pendingCaptures > 0 && (
                  <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
                    {pendingCaptures}
                  </Badge>
                )}
              </Link>
            </Button>
            <Button asChild size="sm" className="ml-1">
              <Link href="/items/new">
                <Plus /> <span className="hidden sm:inline">New item</span>
              </Link>
            </Button>
            <div className="ml-2">
              <UserMenu
                name={user.name}
                email={user.email}
                image={user.image}
                isAdmin={user.role === "admin"}
              />
            </div>
          </nav>
        </div>
      </header>
      <main className="container py-8">{children}</main>
    </div>
  );
}
