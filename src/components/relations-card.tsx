"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, X, Link2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { categoryDef } from "@/lib/categories";

// Relation types the owner can assign (kept inline so this client component does
// not import the server route module).
const RELATIONS = ["related", "part-of", "stored-in", "covers", "accessory-of", "replaces"];

export interface RelatedItemView {
  id: string;
  title: string;
  category: string;
  location: string | null;
}
export interface LinkView {
  id: string;
  relation: string;
  origin: string;
  outgoing: boolean;
  other: { id: string; title: string; category: string };
}

export function RelationsCard({
  itemId,
  related,
  links,
}: {
  itemId: string;
  related: RelatedItemView[];
  links: LinkView[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [relationFor, setRelationFor] = useState<Record<string, string>>({});

  // Dedup links: A→B and B→A with the same relation are distinct rows but should
  // render once on a given item's page.
  const seenLink = new Set<string>();
  const dedupedLinks = links.filter((l) => {
    const k = `${l.other.id}|${l.relation}`;
    if (seenLink.has(k)) return false;
    seenLink.add(k);
    return true;
  });
  const linkedIds = new Set(links.map((l) => l.other.id));
  const suggestions = related.filter((r) => !linkedIds.has(r.id));

  async function addLink(toItemId: string) {
    setBusy(toItemId);
    await fetch(`/api/items/${itemId}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toItemId, relation: relationFor[toItemId] ?? "related" }),
    });
    setBusy(null);
    router.refresh();
  }

  async function removeLink(linkId: string) {
    setBusy(linkId);
    await fetch(`/api/links/${linkId}`, { method: "DELETE" });
    setBusy(null);
    router.refresh();
  }

  if (dedupedLinks.length === 0 && suggestions.length === 0) return null;

  return (
    <Card className="glass">
      <CardContent className="space-y-4 p-6">
        {dedupedLinks.length > 0 && (
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
              <Link2 className="h-4 w-4" /> Linked items
            </h3>
            <div className="space-y-1.5">
              {dedupedLinks.map((l) => {
                const Icon = categoryDef(l.other.category).icon;
                return (
                  <div
                    key={l.id}
                    className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/50 p-2.5"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <Link
                      href={`/items/${l.other.id}`}
                      className="truncate text-sm font-medium hover:text-primary"
                    >
                      {l.other.title}
                    </Link>
                    <Badge variant="secondary" className="shrink-0">
                      {l.outgoing ? l.relation : `${l.relation} (of)`}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-auto h-7 w-7"
                      onClick={() => removeLink(l.id)}
                      disabled={busy === l.id}
                    >
                      {busy === l.id ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <X className="text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {suggestions.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Related items</h3>
            <div className="space-y-1.5">
              {suggestions.map((r) => {
                const Icon = categoryDef(r.category).icon;
                return (
                  <div
                    key={r.id}
                    className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/50 p-2.5"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <Link
                      href={`/items/${r.id}`}
                      className="truncate text-sm font-medium hover:text-primary"
                    >
                      {r.title}
                    </Link>
                    <select
                      value={relationFor[r.id] ?? "related"}
                      onChange={(e) =>
                        setRelationFor((m) => ({ ...m, [r.id]: e.target.value }))
                      }
                      className="ml-auto rounded-md border border-border/60 bg-background/60 px-1.5 py-1 text-xs"
                    >
                      {RELATIONS.map((rel) => (
                        <option key={rel} value={rel}>
                          {rel}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => addLink(r.id)}
                      disabled={busy === r.id}
                    >
                      {busy === r.id ? <Loader2 className="animate-spin" /> : <Plus />}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
