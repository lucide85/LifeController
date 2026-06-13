"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  Loader2,
  Search,
  CheckCircle2,
  FileText,
  StickyNote,
  Package,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Source {
  kind: "item" | "attachment" | "note";
  itemId: string;
  itemTitle: string;
  text: string;
  score: number;
}

interface Result {
  answer: string;
  found: boolean;
  sources: Source[];
  aiDisabled?: boolean;
}

const SUGGESTIONS = [
  "When does my house insurance renew?",
  "What's the serial number of my laptop?",
  "Which receipts do I have for the boat?",
  "What tire pressure does my bike use?",
];

export function SearchView({
  aiEnabled,
  semanticEnabled,
}: {
  aiEnabled: boolean;
  semanticEnabled: boolean;
}) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function ask(question?: string) {
    const query = (question ?? q).trim();
    if (!query) return;
    setQ(query);
    setLoading(true);
    setResult(null);
    const res = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: query }),
    });
    setResult(await res.json());
    setLoading(false);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      <div className="text-center">
        <div className="brand-gradient mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-xl shadow-primary/40">
          <Sparkles className="h-7 w-7" />
        </div>
        <h1 className="text-3xl font-bold text-gradient">Ask your library</h1>
        <p className="mt-2 text-muted-foreground">
          One place to find anything you’ve stored — across every item, file, receipt and note.
        </p>
      </div>

      {!aiEnabled && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <span>
              AI answers are off (no <code>ANTHROPIC_API_KEY</code>). Search still returns
              matching entries from your library.
            </span>
          </CardContent>
        </Card>
      )}

      <Card className="glass">
        <CardContent className="p-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-12 pl-10 text-base"
                placeholder="Ask anything about your stuff…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && ask()}
              />
            </div>
            <Button size="lg" onClick={() => ask()} disabled={loading || !q.trim()}>
              {loading ? <Loader2 className="animate-spin" /> : <Sparkles />} Ask
            </Button>
          </div>
          {!result && !loading && (
            <div className="mt-4 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => ask(s)}>
                  <Badge variant="outline" className="cursor-pointer hover:bg-accent">
                    {s}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {loading && (
        <Card className="bg-card/60">
          <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Searching your library
            {semanticEnabled ? " semantically" : ""}…
          </CardContent>
        </Card>
      )}

      {result && (
        <div className="space-y-4">
          {result.answer && (
            <Card className={result.found ? "border-primary/30 bg-card/60" : "bg-card/60"}>
              <CardContent className="space-y-2 p-5">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {result.found ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Answer
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4 text-muted-foreground" /> Best effort
                    </>
                  )}
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{result.answer}</p>
                {!result.found && (
                  <p className="text-xs text-muted-foreground">
                    Tip: open the most relevant item below and use its{" "}
                    <span className="font-medium">Ask AI</span> tab to search the web and save
                    documentation directly to it.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {result.sources?.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-muted-foreground">
                Matches from your library
              </p>
              {result.sources.map((s, i) => (
                <Link key={i} href={`/items/${s.itemId}`}>
                  <Card className="group bg-card/60 transition-colors hover:border-primary/40">
                    <CardContent className="flex items-center gap-3 p-4">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                        {s.kind === "attachment" ? (
                          <FileText className="h-4 w-4" />
                        ) : s.kind === "note" ? (
                          <StickyNote className="h-4 w-4" />
                        ) : (
                          <Package className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{s.itemTitle}</p>
                        <p className="truncate text-xs text-muted-foreground">{s.text}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
