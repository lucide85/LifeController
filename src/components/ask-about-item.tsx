"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Loader2,
  Globe,
  Send,
  ExternalLink,
  FileText,
  StickyNote,
  CheckCircle2,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Markdown } from "@/components/markdown";
import { ChangeReviewCard, type ProposedOp } from "@/components/change-review-card";

interface Source {
  kind: string;
  attachmentId?: string;
  sourceUrl?: string | null;
  text: string;
}

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  question?: string; // the user question this answer responded to (for web fallback)
  sources?: Source[];
  found?: boolean;
  error?: boolean;
  note?: boolean; // a small system note (e.g. "added N facts")
}

function SourceChip({ s }: { s: Source }) {
  // Only treat http(s) URLs as links (never javascript:/data:).
  if (s.sourceUrl && /^https?:\/\//i.test(s.sourceUrl)) {
    let host = s.sourceUrl;
    try {
      host = new URL(s.sourceUrl).hostname.replace(/^www\./, "");
    } catch {
      /* keep raw */
    }
    return (
      <a
        href={s.sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/40 px-2 py-1 text-xs text-primary hover:underline"
      >
        <Globe className="h-3 w-3" /> {host}
      </a>
    );
  }
  if (s.attachmentId) {
    const name = s.text.split(":")[0].slice(0, 32);
    return (
      <a
        href={`/api/files/${s.attachmentId}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/40 px-2 py-1 text-xs hover:border-primary/40"
      >
        <FileText className="h-3 w-3" /> {name}
      </a>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/40 px-2 py-1 text-xs text-muted-foreground">
      <StickyNote className="h-3 w-3" /> Note
    </span>
  );
}

export function AskAboutItem({ itemId, itemTitle }: { itemId: string; itemTitle: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [webBusyFor, setWebBusyFor] = useState<string | null>(null);
  const [proposeBusyFor, setProposeBusyFor] = useState<string | null>(null);
  const [review, setReview] = useState<{ messageId: string; ops: ProposedOp[] } | null>(null);
  const idRef = useRef(0);
  const nextId = () => `m${++idRef.current}`;

  async function send() {
    const text = q.trim();
    if (!text || busy) return;
    const history = messages
      .filter((m) => !m.note && !m.error)
      .map((m) => ({ role: m.role, content: m.content }));
    const userMsg: Msg = { id: nextId(), role: "user", content: text };
    setMessages((m) => [...m, userMsg]);
    setQ("");
    setBusy(true);

    const res = await fetch(`/api/items/${itemId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, history }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) {
      setMessages((m) => [
        ...m,
        {
          id: nextId(),
          role: "assistant",
          content: typeof data.error === "string" ? data.error : "Something went wrong.",
          error: true,
        },
      ]);
      return;
    }
    setMessages((m) => [
      ...m,
      {
        id: nextId(),
        role: "assistant",
        content: data.answer || "(no answer)",
        question: text,
        sources: Array.isArray(data.sources) ? data.sources : [],
        found: data.found,
      },
    ]);
  }

  async function searchWeb(msg: Msg) {
    setWebBusyFor(msg.id);
    const res = await fetch("/api/search/web", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: msg.question ?? itemTitle, itemId, store: true }),
    });
    const data = await res.json().catch(() => ({}));
    setWebBusyFor(null);
    setMessages((m) => [
      ...m,
      {
        id: nextId(),
        role: "assistant",
        content: data.answer || "No results.",
        sources: (data.citations ?? []).map((c: { url: string; title: string }) => ({
          kind: "web",
          sourceUrl: c.url,
          text: c.title,
        })),
        found: true,
      },
    ]);
    if (data.stored) router.refresh();
  }

  async function proposeFacts(msg: Msg) {
    setProposeBusyFor(msg.id);
    const res = await fetch(`/api/items/${itemId}/propose-changes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceText: msg.content, source: "chat" }),
    });
    const data = await res.json().catch(() => ({}));
    setProposeBusyFor(null);
    const ops: ProposedOp[] = Array.isArray(data.ops) ? data.ops : [];
    if (ops.length === 0) {
      setMessages((m) => [
        ...m,
        { id: nextId(), role: "assistant", content: "No new specs to add from that.", note: true },
      ]);
      return;
    }
    setReview({ messageId: msg.id, ops });
  }

  return (
    <div className="space-y-4">
      {messages.length === 0 && (
        <Card className="glass">
          <CardContent className="p-5 text-sm text-muted-foreground">
            Ask anything about <span className="font-medium text-foreground">{itemTitle}</span> —
            grounded in its specs, files and notes. If something useful comes up, you can save it
            straight to the item.
          </CardContent>
        </Card>
      )}

      {messages.map((msg) =>
        msg.role === "user" ? (
          <div key={msg.id} className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-sm text-primary-foreground">
              {msg.content}
            </div>
          </div>
        ) : msg.note ? (
          <p key={msg.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> {msg.content}
          </p>
        ) : (
          <Card key={msg.id} className={msg.error ? "bg-card/60" : "border-primary/20 bg-card/60"}>
            <CardContent className="space-y-3 p-4">
              {msg.error ? (
                <p className="text-sm text-amber-600">{msg.content}</p>
              ) : (
                <Markdown>{msg.content}</Markdown>
              )}

              {msg.sources && msg.sources.length > 0 && (
                <div className="flex flex-wrap gap-1.5 border-t border-border/60 pt-3">
                  {msg.sources.map((s, i) => (
                    <SourceChip key={i} s={s} />
                  ))}
                </div>
              )}

              {!msg.error && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => proposeFacts(msg)}
                    disabled={proposeBusyFor === msg.id || review !== null}
                  >
                    {proposeBusyFor === msg.id ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Wand2 />
                    )}
                    Save facts to specs
                  </Button>
                  {msg.found === false && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => searchWeb(msg)}
                      disabled={webBusyFor === msg.id}
                    >
                      {webBusyFor === msg.id ? <Loader2 className="animate-spin" /> : <Globe />}
                      Search online &amp; save
                    </Button>
                  )}
                </div>
              )}

              {review?.messageId === msg.id && (
                <ChangeReviewCard
                  itemId={itemId}
                  source="chat"
                  ops={review.ops}
                  onApplied={(changed) => {
                    setReview(null);
                    setMessages((m) => [
                      ...m,
                      {
                        id: nextId(),
                        role: "assistant",
                        content:
                          changed > 0
                            ? `Added ${changed} ${changed === 1 ? "fact" : "facts"} to specs.`
                            : "No changes applied.",
                        note: true,
                      },
                    ]);
                    router.refresh();
                  }}
                  onDismiss={() => setReview(null)}
                />
              )}
            </CardContent>
          </Card>
        )
      )}

      <Card className="glass">
        <CardContent className="p-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Sparkles className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
              <Input
                className="pl-10"
                placeholder={`Ask about “${itemTitle}”…`}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                disabled={busy}
              />
            </div>
            <Button onClick={send} disabled={busy || !q.trim()}>
              {busy ? <Loader2 className="animate-spin" /> : <Send />} Ask
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
