"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Check, X, Files, Link2, Lightbulb, Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export interface SuggestionView {
  id: string;
  kind: "duplicate" | "link" | "field_gap";
  itemId: string;
  itemTitle: string;
  relatedItemId: string | null;
  relatedItemTitle: string | null;
  relation: string | null;
  fieldKey: string | null;
  proposedValue: string | null;
  title: string | null;
  detail: string | null;
  confidence: number | null;
}

const RELATIONS = ["related", "part-of", "stored-in", "covers", "accessory-of", "replaces"];

export function SuggestionsList({ initial }: { initial: SuggestionView[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [relationFor, setRelationFor] = useState<Record<string, string>>({});

  async function accept(s: SuggestionView) {
    setBusy(s.id);
    const body =
      s.kind === "field_gap"
        ? {}
        : { relation: relationFor[s.id] ?? s.relation ?? "related" };
    const res = await fetch(`/api/suggestions/${s.id}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(null);
    if (res.ok) router.refresh();
  }

  async function dismiss(s: SuggestionView) {
    setBusy(s.id);
    await fetch(`/api/suggestions/${s.id}/dismiss`, { method: "POST" });
    setBusy(null);
    router.refresh();
  }

  async function scan() {
    setScanning(true);
    setScanMsg(null);
    try {
      const res = await fetch("/api/suggestions/scan", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const created = Number(data.created ?? 0);
        setScanMsg(
          created > 0
            ? `Found ${created} new suggestion${created === 1 ? "" : "s"}.`
            : "No new suggestions — your library looks tidy."
        );
        router.refresh();
      } else {
        setScanMsg(data.busy ? "A scan is already running…" : "Scan failed. Try again.");
      }
    } catch {
      setScanMsg("Scan failed. Try again.");
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Sparkles className="h-6 w-6 text-primary" /> Suggestions
          </h1>
          <p className="text-sm text-muted-foreground">
            Possible duplicates, links between items, and details I can fill in — you
            decide what sticks.
          </p>
        </div>
        <Button onClick={scan} disabled={scanning} variant="secondary" size="sm">
          {scanning ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          <span className="hidden sm:inline">Scan now</span>
        </Button>
      </div>

      {scanMsg && <p className="text-sm text-muted-foreground">{scanMsg}</p>}

      {initial.length === 0 ? (
        <Card className="border-dashed bg-card/40">
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <Lightbulb className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">Nothing to review right now</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Run a scan and I&apos;ll look across your library for duplicates, related
              items, and spec details hiding in your saved documents.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {initial.map((s) => (
            <Card key={s.id} className="border-primary/20 bg-card/60">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start gap-3">
                  <KindIcon kind={s.kind} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{s.title ?? "Suggestion"}</span>
                      <KindBadge kind={s.kind} />
                      {typeof s.confidence === "number" && (
                        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                          {Math.round(s.confidence * 100)}%
                        </Badge>
                      )}
                    </div>
                    {s.detail && (
                      <p className="text-sm text-muted-foreground">{s.detail}</p>
                    )}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-xs">
                      <Link
                        href={`/items/${s.itemId}`}
                        className="text-primary hover:underline"
                      >
                        {s.itemTitle}
                      </Link>
                      {s.relatedItemId && (
                        <Link
                          href={`/items/${s.relatedItemId}`}
                          className="text-primary hover:underline"
                        >
                          {s.relatedItemTitle ?? "related item"}
                        </Link>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  {s.kind === "link" && (
                    <select
                      value={relationFor[s.id] ?? s.relation ?? "related"}
                      onChange={(e) =>
                        setRelationFor((m) => ({ ...m, [s.id]: e.target.value }))
                      }
                      className="mr-auto rounded-md border border-border/60 bg-background/60 px-2 py-1 text-xs"
                    >
                      {RELATIONS.map((rel) => (
                        <option key={rel} value={rel}>
                          {rel}
                        </option>
                      ))}
                    </select>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => dismiss(s)}
                    disabled={busy === s.id}
                  >
                    <X /> Dismiss
                  </Button>
                  <Button size="sm" onClick={() => accept(s)} disabled={busy === s.id}>
                    {busy === s.id ? <Loader2 className="animate-spin" /> : <Check />}
                    {acceptLabel(s.kind)}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function acceptLabel(kind: SuggestionView["kind"]): string {
  if (kind === "field_gap") return "Add it";
  if (kind === "duplicate") return "Link them";
  return "Link";
}

function KindIcon({ kind }: { kind: SuggestionView["kind"] }) {
  const cls = "mt-0.5 h-5 w-5 shrink-0 text-muted-foreground";
  if (kind === "duplicate") return <Files className={cls} />;
  if (kind === "link") return <Link2 className={cls} />;
  return <Lightbulb className={cls} />;
}

function KindBadge({ kind }: { kind: SuggestionView["kind"] }) {
  const label =
    kind === "duplicate" ? "duplicate" : kind === "link" ? "link" : "fill a gap";
  return (
    <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
      {label}
    </Badge>
  );
}
