"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Upload,
  FileText,
  ImageIcon,
  Receipt,
  Globe,
  Trash2,
  Download,
  Loader2,
  Pencil,
  StickyNote,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { categoryDef } from "@/lib/categories";
import { formatBytes, formatDate } from "@/lib/utils";
import { EditItemForm } from "@/components/edit-item-form";
import { AskAboutItem } from "@/components/ask-about-item";

interface Attachment {
  id: string;
  kind: string;
  source: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sourceUrl: string | null;
  sourceTitle: string | null;
  createdAt: string;
}

interface ItemData {
  id: string;
  title: string;
  category: string;
  description: string | null;
  location: string | null;
  tags: string[];
  fields: Record<string, string>;
  updatedAt: string;
  attachments: Attachment[];
  notes: { id: string; body: string; createdAt: string }[];
}

export function ItemDetail({ item }: { item: ItemData }) {
  const router = useRouter();
  const def = categoryDef(item.category);
  const Icon = def.icon;
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function deleteItem() {
    setDeleting(true);
    const res = await fetch(`/api/items/${item.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Library
      </Link>

      {/* Header */}
      <div className="glass flex flex-col gap-4 rounded-2xl p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="brand-gradient flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-xl shadow-primary/30">
            <Icon className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{item.title}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary">{def.label}</Badge>
              {item.location ? <span>· {item.location}</span> : null}
              <span>· updated {formatDate(item.updatedAt)}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil /> Edit
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="text-destructive" />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="files">Files ({item.attachments.length})</TabsTrigger>
          <TabsTrigger value="notes">Notes ({item.notes.length})</TabsTrigger>
          <TabsTrigger value="ask">
            <Sparkles className="mr-1 h-3.5 w-3.5" /> Ask AI
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Overview item={item} />
        </TabsContent>
        <TabsContent value="files">
          <FilesSection itemId={item.id} attachments={item.attachments} />
        </TabsContent>
        <TabsContent value="notes">
          <NotesSection itemId={item.id} notes={item.notes} />
        </TabsContent>
        <TabsContent value="ask">
          <AskAboutItem itemId={item.id} itemTitle={item.title} />
        </TabsContent>
      </Tabs>

      {/* Edit dialog */}
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit item</DialogTitle>
          </DialogHeader>
          <EditItemForm
            item={item}
            onSaved={() => {
              setEditing(false);
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete “{item.title}”?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This permanently removes the item and all its files, receipts and notes.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={deleteItem} disabled={deleting}>
              {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Overview({ item }: { item: ItemData }) {
  const fieldEntries = Object.entries(item.fields ?? {});
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="glass lg:col-span-2">
        <CardContent className="p-6">
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Description</h3>
          <p className="whitespace-pre-wrap text-sm">
            {item.description || "No description yet — use Edit to add one."}
          </p>
        </CardContent>
      </Card>
      <Card className="glass">
        <CardContent className="space-y-4 p-6">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Specifications</h3>
            {fieldEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">None added.</p>
            ) : (
              <dl className="space-y-2">
                {fieldEntries.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 text-sm">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="text-right font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
          {item.tags.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Tags</h3>
              <div className="flex flex-wrap gap-1">
                {item.tags.map((t) => (
                  <Badge key={t} variant="secondary">
                    {t}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function kindIcon(kind: string, mime: string) {
  if (kind === "receipt") return Receipt;
  if (kind === "image" || mime.startsWith("image/")) return ImageIcon;
  return FileText;
}

function FilesSection({ itemId, attachments }: { itemId: string; attachments: Attachment[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function uploadFiles(files: FileList | File[]) {
    setUploading(true);
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      await fetch(`/api/items/${itemId}/attachments`, { method: "POST", body: fd });
    }
    setUploading(false);
    router.refresh();
  }

  async function remove(id: string) {
    await fetch(`/api/attachments/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-4">
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
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-border/60 hover:border-primary/40"
        }`}
      >
        {uploading ? (
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        ) : (
          <Upload className="h-8 w-8 text-muted-foreground" />
        )}
        <p className="mt-3 text-sm font-medium">
          Drop files, receipts or images here, or click to browse
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          PDFs and images are read so the AI agent can find them later.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => e.target.files && uploadFiles(e.target.files)}
        />
      </div>

      {attachments.length > 0 && (
        <div className="grid gap-2">
          {attachments.map((a) => {
            const FileIcon = kindIcon(a.kind, a.mimeType);
            return (
              <Card key={a.id} className="bg-card/60">
                <CardContent className="flex items-center gap-3 p-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                    {a.source === "web" ? (
                      <Globe className="h-5 w-5 text-primary" />
                    ) : (
                      <FileIcon className="h-5 w-5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{a.fileName}</p>
                      {a.source === "web" ? (
                        <Badge variant="warning" className="shrink-0">
                          web
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(a.sizeBytes)} · {formatDate(a.createdAt)}
                      {a.sourceUrl ? (
                        <>
                          {" · "}
                          <a
                            href={a.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-0.5 text-primary hover:underline"
                          >
                            source <ExternalLink className="h-3 w-3" />
                          </a>
                        </>
                      ) : null}
                    </p>
                  </div>
                  <Button asChild variant="ghost" size="icon">
                    <a href={`/api/files/${a.id}`} target="_blank" rel="noreferrer">
                      <Download />
                    </a>
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(a.id)}>
                    <Trash2 className="text-destructive" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NotesSection({ itemId, notes }: { itemId: string; notes: ItemData["notes"] }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  async function add() {
    if (!body.trim()) return;
    setSaving(true);
    await fetch(`/api/items/${itemId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: body.trim() }),
    });
    setBody("");
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Card className="glass">
        <CardContent className="space-y-3 p-4">
          <Textarea
            placeholder="Add a note — service log, reminder, where you put the spare key…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={add} disabled={saving || !body.trim()}>
              {saving ? <Loader2 className="animate-spin" /> : <StickyNote />} Add note
            </Button>
          </div>
        </CardContent>
      </Card>

      {notes.map((n) => (
        <Card key={n.id} className="bg-card/60">
          <CardContent className="p-4">
            <p className="whitespace-pre-wrap text-sm">{n.body}</p>
            <p className="mt-2 text-xs text-muted-foreground">{formatDate(n.createdAt)}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
