import Link from "next/link";
import { Library, Sparkles, Plus, Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/user-menu";
import type { User } from "@/lib/db/schema";

export function AppShell({
  user,
  children,
}: {
  user: User;
  children: React.ReactNode;
}) {
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
