"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Sparkles, Check, AlertTriangle, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Suggestion {
  description: string;
  fields: Record<string, string>;
}

export function AutofillDialog({
  itemId,
  attachment,
  currentDescription,
  currentFields,
  onClose,
  onApplied,
}: {
  itemId: string;
  attachment: { id: string; fileName: string };
  currentDescription: string | null;
  currentFields: Record<string, string>;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [useDescription, setUseDescription] = useState(true);
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  const [applying, setApplying] = useState(false);
  const [canReread, setCanReread] = useState(false);
  const [rereading, setRereading] = useState(false);

  const runAutofill = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCanReread(false);
    const res = await fetch(`/api/items/${itemId}/autofill`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attachmentId: attachment.id }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(typeof j.error === "string" ? j.error : "Could not read that file.");
      // A 422 means no text was extracted yet — offer to re-read with AI (OCR).
      setCanReread(res.status === 422);
      setLoading(false);
      return;
    }
    const data: Suggestion = await res.json();
    setSuggestion(data);
    setUseDescription(Boolean(data.description));
    setChosen(Object.fromEntries(Object.keys(data.fields ?? {}).map((k) => [k, true] as const)));
    setLoading(false);
  }, [itemId, attachment.id]);

  async function reread() {
    setRereading(true);
    setError(null);
    const res = await fetch(`/api/attachments/${attachment.id}/reextract`, { method: "POST" });
    setRereading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(typeof j.error === "string" ? j.error : "Could not re-read that file.");
      setCanReread(false);
      return;
    }
    await runAutofill();
  }

  useEffect(() => {
    runAutofill();
  }, [runAutofill]);

  async function apply() {
    if (!suggestion) return;
    setApplying(true);
    const fields = { ...currentFields };
    for (const [k, v] of Object.entries(suggestion.fields)) {
      if (chosen[k]) fields[k] = v;
    }
    await fetch(`/api/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: useDescription && suggestion.description ? suggestion.description : currentDescription,
        fields,
      }),
    });
    setApplying(false);
    onApplied();
  }

  const fieldEntries = suggestion ? Object.entries(suggestion.fields) : [];
  const nothingFound = suggestion && !suggestion.description && fieldEntries.length === 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Auto-fill from {attachment.fileName}
          </DialogTitle>
        </DialogHeader>

        {(loading || rereading) && (
          <div className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {rereading
              ? "Re-reading the file with AI (OCR for scans)…"
              : "Reading the file and extracting details…"}
          </div>
        )}

        {error && !rereading && (
          <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <span>{error}</span>
            </div>
            {canReread && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  This looks like a scanned file with no text layer. Let AI read the pages
                  directly — this can take a moment.
                </p>
                <Button size="sm" variant="outline" onClick={reread}>
                  <RefreshCw /> Re-read with AI
                </Button>
              </div>
            )}
          </div>
        )}

        {suggestion && !loading && (
          <div className="space-y-4">
            {nothingFound && (
              <p className="text-sm text-muted-foreground">
                Couldn’t find structured details in this file.
              </p>
            )}
            {suggestion.description && (
              <label className="flex cursor-pointer gap-3 rounded-lg border bg-background/40 p-3">
                <input
                  type="checkbox"
                  checked={useDescription}
                  onChange={(e) => setUseDescription(e.target.checked)}
                  className="mt-1"
                />
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">
                    Description {currentDescription ? "(replaces current)" : ""}
                  </p>
                  <p className="text-sm">{suggestion.description}</p>
                </div>
              </label>
            )}
            {fieldEntries.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground">Specifications</p>
                {fieldEntries.map(([k, v]) => (
                  <label
                    key={k}
                    className="flex cursor-pointer items-center gap-3 rounded-md border bg-background/40 px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={!!chosen[k]}
                      onChange={(e) => setChosen((s) => ({ ...s, [k]: e.target.checked }))}
                    />
                    <span className="text-muted-foreground">{k}</span>
                    <span className="ml-auto text-right font-medium">{v}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={apply} disabled={applying || loading || rereading || !!error || !!nothingFound}>
            {applying ? <Loader2 className="animate-spin" /> : <Check />} Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
