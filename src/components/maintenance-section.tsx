"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Wrench,
  CalendarClock,
  CheckCircle2,
  Pencil,
  Trash2,
  Loader2,
  Sparkles,
  Globe,
  FileText,
  Upload,
  ChevronDown,
  RotateCw,
  ExternalLink,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FilePreview, type PreviewAttachment } from "@/components/file-preview";
import { formatDate, formatBytes } from "@/lib/utils";

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: "planned" | "done";
  dueDate: string | null;
  completedAt: string | null;
  cost: string | null;
  recurrenceMonths: number | null;
  recurrenceNote: string | null;
  source: "user" | "manual" | "web";
  createdAt: string;
}

export interface TaskAttachment {
  id: string;
  taskId: string | null;
  kind: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

interface Routine {
  title: string;
  description: string;
  recurrenceMonths: number | null;
  recurrenceNote: string | null;
}

const DAY = 86_400_000;

function dueState(due: string | null): "overdue" | "soon" | "later" | null {
  if (!due) return null;
  const diff = new Date(due).getTime() - Date.now();
  if (diff < 0) return "overdue";
  if (diff < 30 * DAY) return "soon";
  return "later";
}

function recurrenceLabel(t: { recurrenceMonths: number | null; recurrenceNote: string | null }) {
  if (t.recurrenceNote) return t.recurrenceNote;
  if (t.recurrenceMonths) {
    if (t.recurrenceMonths % 12 === 0) return `every ${t.recurrenceMonths / 12} yr`;
    return `every ${t.recurrenceMonths} mo`;
  }
  return null;
}

export function MaintenanceSection({
  itemId,
  itemTitle,
  tasks,
  attachments,
}: {
  itemId: string;
  itemTitle: string;
  tasks: Task[];
  attachments: TaskAttachment[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Task | "new" | null>(null);
  const [routinesOpen, setRoutinesOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewAttachment | null>(null);

  const planned = useMemo(
    () =>
      tasks
        .filter((t) => t.status === "planned")
        .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999")),
    [tasks]
  );
  const history = useMemo(
    () =>
      tasks
        .filter((t) => t.status === "done")
        .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")),
    [tasks]
  );
  const documents = useMemo(
    () => attachments.filter((a) => !a.taskId && !a.mimeType.startsWith("image/")),
    [attachments]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Log work you’ve done and plan what’s coming up — each task can hold photos and documents.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setRoutinesOpen(true)}>
            <Sparkles /> Suggest routines
          </Button>
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus /> Add task
          </Button>
        </div>
      </div>

      {tasks.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border/60 py-14 text-center">
          <Wrench className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium">No maintenance tasks yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add a task, or let AI suggest service routines from a manual or the web.
          </p>
        </div>
      )}

      {planned.length > 0 && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <CalendarClock className="h-4 w-4" /> Upcoming &amp; planned ({planned.length})
          </h3>
          {planned.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              itemId={itemId}
              attachments={attachments.filter((a) => a.taskId === t.id)}
              onEdit={() => setEditing(t)}
              onPreview={setPreview}
            />
          ))}
        </section>
      )}

      {history.length > 0 && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <History className="h-4 w-4" /> Service history ({history.length})
          </h3>
          {history.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              itemId={itemId}
              attachments={attachments.filter((a) => a.taskId === t.id)}
              onEdit={() => setEditing(t)}
              onPreview={setPreview}
            />
          ))}
        </section>
      )}

      {editing && (
        <TaskDialog
          itemId={itemId}
          task={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}

      {routinesOpen && (
        <RoutinesDialog
          itemId={itemId}
          itemTitle={itemTitle}
          documents={documents}
          onClose={() => setRoutinesOpen(false)}
          onAdded={() => {
            setRoutinesOpen(false);
            router.refresh();
          }}
        />
      )}

      <FilePreview attachment={preview} onOpenChange={(o) => !o && setPreview(null)} />
    </div>
  );
}

function TaskCard({
  task,
  itemId,
  attachments,
  onEdit,
  onPreview,
}: {
  task: Task;
  itemId: string;
  attachments: TaskAttachment[];
  onEdit: () => void;
  onPreview: (a: PreviewAttachment) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const ds = dueState(task.dueDate);
  const rec = recurrenceLabel(task);
  const images = attachments.filter((a) => a.mimeType.startsWith("image/"));
  const docs = attachments.filter((a) => !a.mimeType.startsWith("image/"));

  async function complete() {
    setBusy(true);
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    setBusy(false);
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }

  async function upload(files: FileList) {
    setUploading(true);
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("taskId", task.id);
      await fetch(`/api/items/${itemId}/attachments`, { method: "POST", body: fd });
    }
    setUploading(false);
    router.refresh();
  }

  return (
    <Card className="bg-card/60">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
              task.status === "done" ? "bg-emerald-500/15 text-emerald-500" : "bg-muted"
            }`}
          >
            {task.status === "done" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <Wrench className="h-4 w-4" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{task.title}</p>
              {rec && (
                <Badge variant="secondary" className="gap-1">
                  <RotateCw className="h-3 w-3" /> {rec}
                </Badge>
              )}
              {task.source !== "user" && <Badge variant="outline">{task.source}</Badge>}
            </div>
            {task.description && (
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                {task.description}
              </p>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {task.status === "planned" && task.dueDate && (
                <span
                  className={
                    ds === "overdue"
                      ? "font-medium text-destructive"
                      : ds === "soon"
                        ? "font-medium text-amber-500"
                        : ""
                  }
                >
                  Due {formatDate(task.dueDate)}
                  {ds === "overdue" ? " · overdue" : ""}
                </span>
              )}
              {task.status === "done" && task.completedAt && (
                <span>Done {formatDate(task.completedAt)}</span>
              )}
              {task.cost && <span>· {task.cost}</span>}
              {attachments.length > 0 && (
                <button
                  onClick={() => setOpen((o) => !o)}
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  <ChevronDown className={`h-3 w-3 transition ${open ? "rotate-180" : ""}`} />
                  {attachments.length} file{attachments.length === 1 ? "" : "s"}
                </button>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {task.status === "planned" && (
              <Button variant="ghost" size="sm" onClick={complete} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Done
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={onEdit}>
              <Pencil className="text-muted-foreground" />
            </Button>
            <Button variant="ghost" size="icon" onClick={remove} disabled={busy}>
              <Trash2 className="text-destructive" />
            </Button>
          </div>
        </div>

        {/* Files area */}
        <div className="mt-3 border-t border-border/60 pt-3">
          {open && (images.length > 0 || docs.length > 0) && (
            <div className="mb-3 space-y-2">
              {images.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {images.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => onPreview(a)}
                      className="group relative h-20 w-20 overflow-hidden rounded-lg border bg-muted"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/files/${a.id}`}
                        alt={a.fileName}
                        className="h-full w-full object-cover transition group-hover:scale-105"
                      />
                    </button>
                  ))}
                </div>
              )}
              {docs.map((a) => (
                <button
                  key={a.id}
                  onClick={() => onPreview(a)}
                  className="flex w-full items-center gap-2 rounded-md border bg-background/40 px-2 py-1.5 text-left text-sm hover:bg-accent"
                >
                  <FileText className="h-4 w-4 shrink-0" />
                  <span className="truncate">{a.fileName}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatBytes(a.sizeBytes)}
                  </span>
                </button>
              ))}
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => e.target.files && upload(e.target.files)}
          />
          <Button variant="ghost" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="animate-spin" /> : <Upload />} Add photos / documents
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}
function dateInputToIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(`${v}T00:00:00`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function TaskDialog({
  itemId,
  task,
  onClose,
  onSaved,
}: {
  itemId: string;
  task: Task | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [status, setStatus] = useState<"planned" | "done">(task?.status ?? "planned");
  const [dueDate, setDueDate] = useState(toDateInput(task?.dueDate ?? null));
  const [completedAt, setCompletedAt] = useState(toDateInput(task?.completedAt ?? null));
  const [cost, setCost] = useState(task?.cost ?? "");
  const [recurrenceMonths, setRecurrenceMonths] = useState(
    task?.recurrenceMonths ? String(task.recurrenceMonths) : ""
  );
  const [recurrenceNote, setRecurrenceNote] = useState(task?.recurrenceNote ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!title.trim()) {
      setError("Give the task a title.");
      return;
    }
    setSaving(true);
    setError(null);
    const months = recurrenceMonths.trim() ? parseInt(recurrenceMonths, 10) : null;
    const body = {
      title: title.trim(),
      description: description.trim() || null,
      status,
      dueDate: dateInputToIso(dueDate),
      completedAt: status === "done" ? dateInputToIso(completedAt) : null,
      cost: cost.trim() || null,
      recurrenceMonths: months && months > 0 ? months : null,
      recurrenceNote: recurrenceNote.trim() || null,
    };
    const res = await fetch(task ? `/api/tasks/${task.id}` : `/api/items/${itemId}/tasks`, {
      method: task ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) onSaved();
    else setError("Could not save the task.");
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{task ? "Edit task" : "Add maintenance task"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Oil change" />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as "planned" | "done")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planned">Planned</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {status === "planned" ? (
              <div className="space-y-2">
                <Label>Due date</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Completed</Label>
                <Input
                  type="date"
                  value={completedAt}
                  onChange={(e) => setCompletedAt(e.target.value)}
                />
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cost (optional)</Label>
              <Input value={cost} onChange={(e) => setCost(e.target.value)} placeholder="e.g. 1 200 kr" />
            </div>
            <div className="space-y-2">
              <Label>Repeat every (months)</Label>
              <Input
                type="number"
                min={1}
                value={recurrenceMonths}
                onChange={(e) => setRecurrenceMonths(e.target.value)}
                placeholder="e.g. 6"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Or repeat note (optional)</Label>
            <Input
              value={recurrenceNote}
              onChange={(e) => setRecurrenceNote(e.target.value)}
              placeholder="e.g. every 10 000 km"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : null} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RoutinesDialog({
  itemId,
  itemTitle,
  documents,
  onClose,
  onAdded,
}: {
  itemId: string;
  itemTitle: string;
  documents: TaskAttachment[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [source, setSource] = useState<"web" | "manual">(documents.length ? "manual" : "web");
  const [attachmentId, setAttachmentId] = useState(documents[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [routines, setRoutines] = useState<Routine[] | null>(null);
  const [citations, setCitations] = useState<{ url: string; title: string }[]>([]);
  const [selected, setSelected] = useState<Record<number, boolean>>({});

  async function find() {
    setLoading(true);
    setError(null);
    setRoutines(null);
    const res = await fetch(`/api/items/${itemId}/routines`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, attachmentId: source === "manual" ? attachmentId : undefined }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Could not generate routines.");
      return;
    }
    const data = await res.json();
    setRoutines(data.routines ?? []);
    setCitations(data.citations ?? []);
    setSelected(Object.fromEntries((data.routines ?? []).map((_: Routine, i: number) => [i, true])));
  }

  async function add() {
    if (!routines) return;
    setAdding(true);
    const chosen = routines.filter((_, i) => selected[i]);
    for (const r of chosen) {
      const due =
        r.recurrenceMonths && r.recurrenceMonths > 0
          ? (() => {
              const d = new Date();
              d.setMonth(d.getMonth() + r.recurrenceMonths!);
              return d.toISOString();
            })()
          : null;
      await fetch(`/api/items/${itemId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: r.title,
          description: r.description || null,
          status: "planned",
          dueDate: due,
          recurrenceMonths: r.recurrenceMonths,
          recurrenceNote: r.recurrenceNote,
          source,
        }),
      });
    }
    setAdding(false);
    onAdded();
  }

  const chosenCount = routines ? routines.filter((_, i) => selected[i]).length : 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Suggest service routines</DialogTitle>
        </DialogHeader>

        {!routines && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Generate a maintenance schedule for <span className="font-medium">{itemTitle}</span>{" "}
              from an uploaded manual or from the web.
            </p>
            <Select value={source} onValueChange={(v) => setSource(v as "web" | "manual")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual" disabled={documents.length === 0}>
                  From an uploaded manual{documents.length === 0 ? " (none uploaded)" : ""}
                </SelectItem>
                <SelectItem value="web">From the web</SelectItem>
              </SelectContent>
            </Select>
            {source === "manual" && documents.length > 0 && (
              <Select value={attachmentId} onValueChange={setAttachmentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a document" />
                </SelectTrigger>
                <SelectContent>
                  {documents.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.fileName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={find} disabled={loading} className="w-full">
              {loading ? <Loader2 className="animate-spin" /> : source === "web" ? <Globe /> : <FileText />}
              Find routines
            </Button>
          </div>
        )}

        {routines && (
          <div className="space-y-3">
            {routines.length === 0 && (
              <p className="text-sm text-muted-foreground">No routines found. Try the other source.</p>
            )}
            <div className="max-h-[50vh] space-y-2 overflow-y-auto">
              {routines.map((r, i) => (
                <label
                  key={i}
                  className="flex cursor-pointer gap-3 rounded-lg border bg-background/40 p-3"
                >
                  <input
                    type="checkbox"
                    checked={!!selected[i]}
                    onChange={(e) => setSelected((s) => ({ ...s, [i]: e.target.checked }))}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{r.title}</span>
                      {recurrenceLabel(r) && (
                        <Badge variant="secondary" className="gap-1">
                          <RotateCw className="h-3 w-3" /> {recurrenceLabel(r)}
                        </Badge>
                      )}
                    </div>
                    {r.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{r.description}</p>
                    )}
                  </div>
                </label>
              ))}
            </div>
            {citations.length > 0 && (
              <div className="space-y-1 border-t border-border/60 pt-2">
                <p className="text-xs font-semibold text-muted-foreground">Sources</p>
                {citations.map((c) => (
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
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {routines && routines.length > 0 && (
            <Button onClick={add} disabled={adding || chosenCount === 0}>
              {adding ? <Loader2 className="animate-spin" /> : <Plus />} Add {chosenCount} task
              {chosenCount === 1 ? "" : "s"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
