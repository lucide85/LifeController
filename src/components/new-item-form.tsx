"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORIES } from "@/lib/categories";

interface FieldRow {
  key: string;
  value: string;
}

export function NewItemForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("general");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [tags, setTags] = useState("");
  const [fields, setFields] = useState<FieldRow[]>([{ key: "", value: "" }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setField(i: number, patch: Partial<FieldRow>) {
    setFields((f) => f.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  async function submit() {
    if (!title.trim()) {
      setError("Give your item a title.");
      return;
    }
    setLoading(true);
    setError(null);

    const fieldObj: Record<string, string> = {};
    for (const { key, value } of fields) {
      if (key.trim()) fieldObj[key.trim()] = value;
    }

    const res = await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        category,
        description: description.trim() || undefined,
        location: location.trim() || undefined,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        fields: fieldObj,
      }),
    });

    if (res.ok) {
      const { item } = await res.json();
      router.push(`/items/${item.id}`);
      router.refresh();
    } else {
      setLoading(false);
      setError("Could not create the item. Please try again.");
    }
  }

  return (
    <Card className="glass">
      <CardContent className="space-y-5 p-6">
        <div className="space-y-2">
          <Label htmlFor="title">Title *</Label>
          <Input
            id="title"
            placeholder="e.g. Summer cabin, Trek Émonda, Beneteau 31…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              placeholder="Where it is / lives"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            placeholder="Anything worth knowing at a glance…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-[100px]"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="tags">Tags (comma separated)</Label>
          <Input
            id="tags"
            placeholder="insurance, warranty, blue"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>Specifications / details</Label>
          <p className="text-xs text-muted-foreground">
            Free-form facts: serial number, model, VIN, IP range, registration, dates…
          </p>
          <div className="space-y-2">
            {fields.map((row, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  placeholder="Field"
                  value={row.key}
                  onChange={(e) => setField(i, { key: e.target.value })}
                  className="max-w-[40%]"
                />
                <Input
                  placeholder="Value"
                  value={row.value}
                  onChange={(e) => setField(i, { value: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setFields((f) => f.filter((_, idx) => idx !== i))}
                  disabled={fields.length === 1}
                >
                  <Trash2 className="text-muted-foreground" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setFields((f) => [...f, { key: "", value: "" }])}
          >
            <Plus /> Add field
          </Button>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <Plus />} Create item
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
