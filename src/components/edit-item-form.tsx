"use client";

import { useState } from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORIES } from "@/lib/categories";

// Front-page layout archetypes (kept inline so this client component doesn't pull
// in the server-only distill module / Anthropic SDK).
const LAYOUT_OPTIONS: { value: string; label: string }[] = [
  { value: "generic", label: "Generic" },
  { value: "property", label: "Property / House" },
  { value: "vehicle", label: "Vehicle" },
  { value: "travel", label: "Travel plan" },
  { value: "tech", label: "Tech / Electronics" },
  { value: "vessel", label: "Boat / Vessel" },
  { value: "document", label: "Document" },
];

interface EditItem {
  id: string;
  title: string;
  category: string;
  description: string | null;
  location: string | null;
  tags: string[];
  fields: Record<string, string>;
  layout?: string;
}

export function EditItemForm({ item, onSaved }: { item: EditItem; onSaved: () => void }) {
  const [title, setTitle] = useState(item.title);
  const [category, setCategory] = useState(item.category);
  const [description, setDescription] = useState(item.description ?? "");
  const [location, setLocation] = useState(item.location ?? "");
  const [tags, setTags] = useState(item.tags.join(", "));
  const [layout, setLayout] = useState(item.layout ?? "generic");
  const [fields, setFields] = useState<{ key: string; value: string }[]>(
    Object.entries(item.fields ?? {}).map(([key, value]) => ({ key, value })) || []
  );
  const [saving, setSaving] = useState(false);

  function setField(i: number, patch: Partial<{ key: string; value: string }>) {
    setFields((f) => f.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  async function save() {
    setSaving(true);
    const fieldObj: Record<string, string> = {};
    for (const { key, value } of fields) if (key.trim()) fieldObj[key.trim()] = value;

    await fetch(`/api/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        category,
        description: description.trim() || null,
        location: location.trim() || null,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        fields: fieldObj,
        layout,
      }),
    });
    setSaving(false);
    onSaved();
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
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
          <Label>Location</Label>
          <Input value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Front-page layout</Label>
        <Select value={layout} onValueChange={setLayout}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LAYOUT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Controls how the overview is presented. Auto-set when you generate a summary.
        </p>
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Tags (comma separated)</Label>
        <Input value={tags} onChange={(e) => setTags(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Specifications</Label>
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
              variant="ghost"
              size="icon"
              onClick={() => setFields((f) => f.filter((_, idx) => idx !== i))}
            >
              <Trash2 className="text-muted-foreground" />
            </Button>
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setFields((f) => [...f, { key: "", value: "" }])}
        >
          <Plus /> Add field
        </Button>
      </div>
      <div className="flex justify-end pt-2">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />} Save changes
        </Button>
      </div>
    </div>
  );
}
