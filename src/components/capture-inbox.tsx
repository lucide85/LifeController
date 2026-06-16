"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Inbox,
  Upload,
  Loader2,
  Check,
  X,
  Pencil,
  Globe,
  FileText,
  StickyNote,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface Candidate {
  id: string;
  title: string;
  score: number;
}
interface Suggestion {
  action: "attach" | "create";
  targetItemId: string | null;
  title: string | null;
  category: string | null;
  summary: string | null;
  tags: string[];
  fields: Record<string, string>;
  confidence: number;
  candidates: Candidate[];
}
export interface InboxCapture {
  id: string;
  kind: "text" | "url" | "file";
  rawText: string | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
  fileName: string | null;
  mimeType: string | null;
  imageUrl: string | null;
  extractedText: string | null;
  suggestion: Suggestion | null;
  createdAt: string;
}

function looksLikeUrl(s: string): boolean {
  const t = s.trim();
  if (/^https?:\/\//i.test(t)) return true;
  return !/\s/.test(t) && /^[^\s]+\.[^\s]{2,}$/.test(t);
}

function captureTitle(c: InboxCapture): string {
  return (
    c.suggestion?.title ||
    c.sourceTitle ||
    c.fileName ||
    (c.extractedText ? c.extractedText.slice(0, 60) : "") ||
    c.sourceUrl ||
    "Untitled"
  );
}

export function CaptureInbox({ initial }: { initial: InboxCapture[] }) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const isUrl = looksLikeUrl(input);

  async function addTextOrUrl() {
    const text = input.trim();
    if (!text || adding) return;
    setAdding(true);
    const body = looksLikeUrl(text) ? { url: text } : { text };
    const res = await fetch("/api/captures", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setAdding(false);
    if (res.ok) {
      setInput("");
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({}));
      alert(typeof j.error === "string" ? j.error : "Could not add that.");
    }
  }

  async function uploadFiles(files: FileList | File[]) {
    setUploading(true);
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      await fetch("/api/captures", { method: "POST", body: fd });
    }
    setUploading(false);
    router.refresh();
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="glass rounded-2xl p-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Inbox className="h-6 w-6 text-primary" /> Inbox
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Drop anything — a file, a link, or a quick note. The AI sorts it and proposes where it
          belongs; you confirm.
        </p>

        <div className="mt-4 space-y-3">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
            }}
            onClick={() => fileRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
              dragOver ? "border-primary bg-primary/5" : "border-border/60 hover:border-primary/40"
            }`}
          >
            {uploading ? (
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            ) : (
              <Upload className="h-6 w-6 text-muted-foreground" />
            )}
            <p className="mt-2 text-sm">Drop files here, or click to browse</p>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              onChange={(e) => e.target.files && uploadFiles(e.target.files)}
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Textarea
              placeholder="Paste a link or jot a note…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="min-h-[44px] flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addTextOrUrl();
              }}
            />
            <div className="flex flex-col items-end gap-1">
              <Button onClick={addTextOrUrl} disabled={adding || !input.trim()}>
                {adding ? <Loader2 className="animate-spin" /> : <Sparkles />} Add
              </Button>
              {input.trim() && (
                <span className="text-[11px] text-muted-foreground">
                  as {isUrl ? "a link" : "a note"}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {initial.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 py-16 text-center">
          <Check className="h-10 w-10 text-emerald-500/60" />
          <p className="mt-3 text-sm text-muted-foreground">Inbox zero. Nothing to triage.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {initial.map((c) => (
            <TriageCard key={c.id} capture={c} onChanged={() => router.refresh()} />
          ))}
        </div>
      )}
    </div>
  );
}

function KindIcon({ kind }: { kind: InboxCapture["kind"] }) {
  if (kind === "url") return <Globe className="h-4 w-4 text-primary" />;
  if (kind === "file") return <FileText className="h-4 w-4 text-primary" />;
  return <StickyNote className="h-4 w-4 text-primary" />;
}

function TriageCard({
  capture,
  onChanged,
}: {
  capture: InboxCapture;
  onChanged: () => void;
}) {
  const s = capture.suggestion;
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [action, setAction] = useState<"attach" | "create">(s?.action ?? "create");
  const [targetItemId, setTargetItemId] = useState<string | null>(s?.targetItemId ?? null);
  const [title, setTitle] = useState(s?.title ?? captureTitle(capture));
  const [category, setCategory] = useState(s?.category ?? "general");

  const candidates = s?.candidates ?? [];
  const targetTitle = candidates.find((c) => c.id === (s?.targetItemId ?? targetItemId))?.title;

  async function commit(payload: Record<string, unknown>) {
    setBusy(true);
    const res = await fetch(`/api/captures/${capture.id}/commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (res.ok) {
      onChanged();
    } else {
      const j = await res.json().catch(() => ({}));
      alert(typeof j.error === "string" ? j.error : "Could not file that.");
    }
  }

  function acceptSuggested() {
    if (s?.action === "attach" && s.targetItemId) {
      commit({ action: "attach", targetItemId: s.targetItemId });
    } else {
      commit({
        action: "create",
        title: s?.title || captureTitle(capture),
        category: s?.category || "general",
        description: s?.summary || undefined,
        tags: s?.tags ?? [],
        fields: s?.fields ?? {},
      });
    }
  }

  function applyEdit() {
    if (action === "attach" && targetItemId) {
      commit({ action: "attach", targetItemId });
    } else {
      commit({
        action: "create",
        title: title.trim() || "Untitled",
        category: category.trim() || "general",
        description: s?.summary || undefined,
        tags: s?.tags ?? [],
        fields: s?.fields ?? {},
      });
    }
  }

  async function discard() {
    setBusy(true);
    await fetch(`/api/captures/${capture.id}/discard`, { method: "POST" });
    setBusy(false);
    onChanged();
  }

  return (
    <Card className="bg-card/60">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
            <KindIcon kind={capture.kind} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{captureTitle(capture)}</p>
            {capture.sourceUrl && (
              <a
                href={/^https?:\/\//i.test(capture.sourceUrl) ? capture.sourceUrl : undefined}
                target="_blank"
                rel="noreferrer"
                className="truncate text-xs text-primary hover:underline"
              >
                {capture.sourceUrl}
              </a>
            )}
            {capture.extractedText && (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {capture.extractedText}
              </p>
            )}
          </div>
        </div>

        {/* Proposal */}
        {!editing ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-background/40 p-3 text-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            {s?.action === "attach" && (s?.targetItemId || targetTitle) ? (
              <span>
                Attach to <span className="font-medium">{targetTitle ?? "an item"}</span>
              </span>
            ) : (
              <span>
                Create new item{" "}
                <span className="font-medium">{s?.title || captureTitle(capture)}</span>
                <Badge variant="secondary" className="ml-2">
                  {s?.category || "general"}
                </Badge>
              </span>
            )}
            {typeof s?.confidence === "number" && s.confidence > 0 && (
              <span className="ml-auto text-xs text-muted-foreground">
                {Math.round(s.confidence * 100)}%
              </span>
            )}
          </div>
        ) : (
          <div className="space-y-2 rounded-lg border border-border/60 bg-background/40 p-3">
            <div className="flex flex-wrap gap-2 text-sm">
              <button
                onClick={() => setAction("create")}
                className={`rounded-md border px-2 py-1 ${
                  action === "create" ? "border-primary bg-primary/10" : "border-border/60"
                }`}
              >
                Create new
              </button>
              {candidates.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setAction("attach");
                    setTargetItemId(c.id);
                  }}
                  className={`rounded-md border px-2 py-1 ${
                    action === "attach" && targetItemId === c.id
                      ? "border-primary bg-primary/10"
                      : "border-border/60"
                  }`}
                >
                  {c.title}
                </button>
              ))}
            </div>
            {action === "create" && (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Title"
                />
                <Input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Category"
                  className="sm:max-w-[40%]"
                />
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={discard} disabled={busy}>
            <X /> Discard
          </Button>
          {editing ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={busy}>
                Cancel
              </Button>
              <Button size="sm" onClick={applyEdit} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Check />} File it
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)} disabled={busy}>
                <Pencil /> Edit
              </Button>
              <Button size="sm" onClick={acceptSuggested} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <ArrowRight />} Accept
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
