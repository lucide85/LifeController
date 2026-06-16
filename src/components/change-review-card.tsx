"use client";

import { useState } from "react";
import { Loader2, Check, GitCommitVertical, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export interface ProposedOp {
  key: string;
  newValue: string;
  oldValue: string | null;
  confidence: number;
  status: "auto" | "review" | "conflict" | "noop";
}

// Reviewable diff of AI-proposed spec changes. Additive high-confidence facts
// (status "auto") are pre-selected; anything that would overwrite an existing
// value ("conflict") is flagged and left unchecked, so the owner stays in control.
export function ChangeReviewCard({
  itemId,
  source,
  sourceUrl,
  ops,
  onApplied,
  onDismiss,
}: {
  itemId: string;
  source: "chat" | "web" | "manual" | "ai" | "upload";
  sourceUrl?: string;
  ops: ProposedOp[];
  onApplied: (changed: number) => void;
  onDismiss: () => void;
}) {
  const [selected, setSelected] = useState<boolean[]>(ops.map((o) => o.status === "auto"));
  const [values, setValues] = useState<string[]>(ops.map((o) => o.newValue));
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosenCount = selected.filter(Boolean).length;

  async function apply() {
    setApplying(true);
    setError(null);
    const chosen = ops
      .map((o, i) => ({ o, i }))
      .filter(({ i }) => selected[i])
      .map(({ o, i }) => ({ key: o.key, value: values[i], confidence: o.confidence }));

    const res = await fetch(`/api/items/${itemId}/apply-changes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, sourceUrl, ops: chosen }),
    });
    setApplying(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(typeof j.error === "string" ? j.error : "Could not apply changes.");
      return;
    }
    const data = await res.json();
    onApplied(data.changed ?? chosen.length);
  }

  return (
    <Card className="border-primary/30 bg-card/60">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <GitCommitVertical className="h-4 w-4 text-primary" /> Proposed updates to specs
        </div>

        <div className="space-y-1.5">
          {ops.map((op, i) => (
            <label
              key={`${op.key}-${i}`}
              className={`flex items-start gap-3 rounded-md border p-2.5 text-sm ${
                op.status === "conflict"
                  ? "border-amber-500/40 bg-amber-500/5"
                  : "border-border/60 bg-background/40"
              }`}
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={selected[i]}
                onChange={(e) =>
                  setSelected((s) => s.map((v, idx) => (idx === i ? e.target.checked : v)))
                }
              />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{op.key}</span>
                  {op.status === "conflict" && (
                    <Badge variant="warning" className="gap-1">
                      <AlertTriangle className="h-3 w-3" /> overwrites
                    </Badge>
                  )}
                  {op.status === "auto" && <Badge variant="secondary">new</Badge>}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {Math.round(op.confidence * 100)}%
                  </span>
                </div>
                {op.status === "conflict" && op.oldValue && (
                  <p className="text-xs text-muted-foreground line-through">{op.oldValue}</p>
                )}
                <Input
                  value={values[i]}
                  onChange={(e) =>
                    setValues((v) => v.map((val, idx) => (idx === i ? e.target.value : val)))
                  }
                  className="h-8 text-sm"
                />
              </div>
            </label>
          ))}
        </div>

        {error && (
          <p className="flex items-start gap-2 text-sm text-amber-600">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onDismiss} disabled={applying}>
            Dismiss
          </Button>
          <Button size="sm" onClick={apply} disabled={applying || chosenCount === 0}>
            {applying ? <Loader2 className="animate-spin" /> : <Check />} Apply {chosenCount || ""}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
