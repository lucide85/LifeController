"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Plus, Sparkles, FolderOpen } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CATEGORIES, categoryDef } from "@/lib/categories";
import { formatDate } from "@/lib/utils";

interface ItemRow {
  id: string;
  title: string;
  category: string;
  description: string | null;
  location: string | null;
  tags: string[] | null;
  updatedAt: string;
}

export function LibraryView({
  items,
  userName,
}: {
  items: ItemRow[];
  userName?: string;
}) {
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<string | null>(null);

  const usedCategories = useMemo(() => {
    const set = new Set(items.map((i) => i.category));
    return CATEGORIES.filter((c) => set.has(c.key));
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (activeCat && i.category !== activeCat) return false;
      if (!q) return true;
      return (
        i.title.toLowerCase().includes(q) ||
        (i.description ?? "").toLowerCase().includes(q) ||
        (i.location ?? "").toLowerCase().includes(q) ||
        (i.tags ?? []).some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [items, query, activeCat]);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl glass p-8">
        <div className="relative z-10">
          <h1 className="text-3xl font-bold tracking-tight text-gradient">
            {userName ? `Welcome back, ${userName.split(" ")[0]}` : "Your library"}
          </h1>
          <p className="mt-2 max-w-xl text-muted-foreground">
            Everything you own and care about — houses, vehicles, gear, cabins, boats,
            travel — in one searchable place. Ask the AI agent anything about your stuff.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/items/new">
                <Plus /> Add an item
              </Link>
            </Button>
            <Button asChild variant="outline" className="bg-background/50">
              <Link href="/search">
                <Sparkles /> Ask the AI agent
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Search + filters */}
      <div className="flex flex-col gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter your library…"
            className="pl-10 h-11"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {usedCategories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setActiveCat(null)}>
              <Badge variant={activeCat === null ? "default" : "outline"} className="cursor-pointer">
                All ({items.length})
              </Badge>
            </button>
            {usedCategories.map((c) => {
              const count = items.filter((i) => i.category === c.key).length;
              const Icon = c.icon;
              return (
                <button key={c.key} onClick={() => setActiveCat(c.key === activeCat ? null : c.key)}>
                  <Badge
                    variant={activeCat === c.key ? "default" : "outline"}
                    className="cursor-pointer gap-1"
                  >
                    <Icon className="h-3 w-3" /> {c.label} ({count})
                  </Badge>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Grid / empty state */}
      {filtered.length === 0 ? (
        <EmptyState hasItems={items.length > 0} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function ItemCard({ item }: { item: ItemRow }) {
  const def = categoryDef(item.category);
  const Icon = def.icon;
  return (
    <Link href={`/items/${item.id}`} className="group">
      <Card className="h-full overflow-hidden border-border/60 bg-card/60 backdrop-blur transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="brand-gradient flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-lg shadow-primary/20">
              <Icon className="h-5 w-5" />
            </div>
            <span className="text-xs text-muted-foreground">{formatDate(item.updatedAt)}</span>
          </div>
          <h3 className="mt-4 font-semibold leading-tight transition-colors group-hover:text-primary">
            {item.title}
          </h3>
          {item.location ? (
            <p className="mt-1 text-xs text-muted-foreground">{item.location}</p>
          ) : null}
          {item.description ? (
            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
          ) : null}
          {item.tags && item.tags.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1">
              {item.tags.slice(0, 4).map((t) => (
                <Badge key={t} variant="secondary" className="text-[10px]">
                  {t}
                </Badge>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </Link>
  );
}

function EmptyState({ hasItems }: { hasItems: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 py-20 text-center">
      <FolderOpen className="h-12 w-12 text-muted-foreground/50" />
      <h3 className="mt-4 font-semibold">{hasItems ? "Nothing matches" : "Your library is empty"}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {hasItems
          ? "Try a different search or clear the category filter."
          : "Add your first item — a house, bike, boat, computer, or a travel plan."}
      </p>
      {!hasItems && (
        <Button asChild className="mt-5">
          <Link href="/items/new">
            <Plus /> Add your first item
          </Link>
        </Button>
      )}
    </div>
  );
}
