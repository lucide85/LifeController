"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Loader2,
  Globe,
  Search,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

interface LibraryResult {
  answer: string;
  found: boolean;
  aiDisabled?: boolean;
}

interface WebResult {
  answer: string;
  citations: { url: string; title: string }[];
  stored: boolean;
}

export function AskAboutItem({ itemId, itemTitle }: { itemId: string; itemTitle: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [phase, setPhase] = useState<"idle" | "library" | "web">("idle");
  const [lib, setLib] = useState<LibraryResult | null>(null);
  const [web, setWeb] = useState<WebResult | null>(null);

  async function askLibrary() {
    if (!q.trim()) return;
    setPhase("library");
    setLib(null);
    setWeb(null);
    const res = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: q.trim() }),
    });
    const data = await res.json();
    setLib(data);
    setPhase("idle");
  }

  async function searchWebAndStore() {
    setPhase("web");
    const res = await fetch("/api/search/web", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: q.trim(), itemId, store: true }),
    });
    const data = await res.json();
    setWeb(data);
    setPhase("idle");
    if (data.stored) router.refresh();
  }

  return (
    <div className="space-y-4">
      <Card className="glass">
        <CardContent className="p-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Sparkles className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
              <Input
                className="pl-10"
                placeholder={`Ask anything about “${itemTitle}”…`}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && askLibrary()}
              />
            </div>
            <Button onClick={askLibrary} disabled={phase !== "idle" || !q.trim()}>
              {phase === "library" ? <Loader2 className="animate-spin" /> : <Search />} Ask
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Library answer */}
      {lib && (
        <Card className={lib.found ? "border-primary/30 bg-card/60" : "bg-card/60"}>
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center gap-2 text-sm font-medium">
              {lib.found ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" /> From your library
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 text-muted-foreground" /> Not found in your library
                </>
              )}
            </div>
            {lib.answer ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{lib.answer}</p>
            ) : null}

            {!lib.found && !lib.aiDisabled && (
              <div className="rounded-lg border border-border/60 bg-background/40 p-4">
                <p className="text-sm">
                  I don’t have this in your stored library. Want me to search online using what
                  I know about <span className="font-medium">{itemTitle}</span>, and save what I
                  find to this item?
                </p>
                <Button className="mt-3" size="sm" onClick={searchWebAndStore} disabled={phase !== "idle"}>
                  {phase === "web" ? <Loader2 className="animate-spin" /> : <Globe />}
                  Search online &amp; save here
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Web finding */}
      {web && (
        <Card className="border-amber-500/30 bg-card/60">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Globe className="h-4 w-4 text-amber-500" /> Found online
              {web.stored && (
                <span className="inline-flex items-center gap-1 text-emerald-500">
                  <CheckCircle2 className="h-4 w-4" /> saved to this item
                </span>
              )}
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{web.answer}</p>
            {web.citations?.length > 0 && (
              <div className="space-y-1 border-t border-border/60 pt-3">
                <p className="text-xs font-semibold text-muted-foreground">Sources</p>
                {web.citations.map((c) => (
                  <a
                    key={c.url}
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" /> {c.title}
                  </a>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
