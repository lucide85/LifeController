"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, ImageIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface CommonsImage {
  title: string;
  thumbUrl: string;
  fullUrl: string;
  descriptionUrl: string;
  license: string | null;
  artist: string | null;
}

export function CoverDialog({
  itemId,
  defaultQuery,
  onClose,
}: {
  itemId: string;
  defaultQuery: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(defaultQuery);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [images, setImages] = useState<CommonsImage[]>([]);

  const search = useCallback(
    async (q: string) => {
      setLoading(true);
      const res = await fetch(
        `/api/items/${itemId}/images/search?q=${encodeURIComponent(q)}`
      );
      const data = await res.json().catch(() => ({}));
      setImages(Array.isArray(data.images) ? data.images : []);
      setLoading(false);
    },
    [itemId]
  );

  useEffect(() => {
    search(defaultQuery);
  }, [search, defaultQuery]);

  async function pick(img: CommonsImage) {
    setApplying(img.fullUrl);
    const attribution = [img.artist, img.license].filter(Boolean).join(" · ") || undefined;
    const res = await fetch(`/api/items/${itemId}/cover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        download: { url: img.fullUrl, sourceUrl: img.descriptionUrl || undefined, attribution },
      }),
    });
    setApplying(null);
    if (res.ok) {
      router.refresh();
      onClose();
    } else {
      const j = await res.json().catch(() => ({}));
      alert(typeof j.error === "string" ? j.error : "Could not set the cover.");
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-primary" /> Find a cover image
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search(query)}
            placeholder="Search Wikimedia Commons…"
          />
          <Button variant="outline" onClick={() => search(query)} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <Search />}
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Searching…
          </div>
        ) : images.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No images found. Try a more general search (a model name, place or object).
          </p>
        ) : (
          <div className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
            {images.map((img) => (
              <button
                key={img.fullUrl}
                onClick={() => pick(img)}
                disabled={!!applying}
                className="group overflow-hidden rounded-lg border border-border/60 text-left transition-colors hover:border-primary/50"
              >
                <div className="relative aspect-video bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.thumbUrl}
                    alt={img.title}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                  {applying === img.fullUrl && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    </div>
                  )}
                </div>
                <div className="p-2">
                  <p className="truncate text-xs font-medium">{img.title}</p>
                  {(img.license || img.artist) && (
                    <p className="truncate text-[10px] text-muted-foreground">
                      {[img.artist, img.license].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          Images from Wikimedia Commons. Attribution and license are saved with the image.
        </p>
      </DialogContent>
    </Dialog>
  );
}
