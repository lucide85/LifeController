"use client";

import { useEffect, useState } from "react";
import {
  ImageIcon,
  ArrowUpDown,
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

export interface GalleryImage {
  id: string;
  fileName: string;
  createdAt: string; // ISO
  source: string;
  sourceUrl: string | null;
}

// A date-sortable image gallery aggregating every image attached to an item
// (item-level uploads, maintenance-task photos, and web-sourced images), with a
// keyboard-navigable lightbox. Grid uses small WebP thumbnails (?variant=thumb).
export function GallerySection({ images }: { images: GalleryImage[] }) {
  const [newestFirst, setNewestFirst] = useState(true);
  const [open, setOpen] = useState<number | null>(null);

  const sorted = [...images].sort((a, b) =>
    newestFirst
      ? a.createdAt < b.createdAt
        ? 1
        : -1
      : a.createdAt > b.createdAt
        ? 1
        : -1
  );

  useEffect(() => {
    if (open === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(null);
      else if (e.key === "ArrowRight")
        setOpen((i) => (i === null ? i : Math.min(i + 1, sorted.length - 1)));
      else if (e.key === "ArrowLeft")
        setOpen((i) => (i === null ? i : Math.max(i - 1, 0)));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, sorted.length]);

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 py-16 text-center">
        <ImageIcon className="h-10 w-10 text-muted-foreground/50" />
        <p className="mt-3 max-w-sm text-sm text-muted-foreground">
          No images yet. Upload photos from the Files tab, or attach them to a maintenance task.
        </p>
      </div>
    );
  }

  const current = open !== null ? sorted[open] : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {images.length} image{images.length === 1 ? "" : "s"}
        </p>
        <Button variant="outline" size="sm" onClick={() => setNewestFirst((d) => !d)}>
          <ArrowUpDown /> {newestFirst ? "Newest first" : "Oldest first"}
        </Button>
      </div>

      <div className="columns-2 gap-3 sm:columns-3 lg:columns-4 [&>*]:mb-3">
        {sorted.map((img, i) => (
          <button
            key={img.id}
            onClick={() => setOpen(i)}
            className="group block w-full break-inside-avoid overflow-hidden rounded-xl border border-border/60 bg-muted/30 text-left"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/files/${img.id}?variant=thumb`}
              alt={img.fileName}
              loading="lazy"
              className="w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
            <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11px] text-muted-foreground">
              <span className="flex min-w-0 items-center gap-1">
                {img.source === "web" ? <Globe className="h-3 w-3 shrink-0 text-primary" /> : null}
                <span className="truncate">{img.fileName}</span>
              </span>
              <span className="shrink-0">{formatDate(img.createdAt)}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Lightbox */}
      {current && open !== null && (
        <div
          className="animate-fade-in fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm"
          onClick={() => setOpen(null)}
        >
          <div
            className="flex items-center justify-between gap-3 p-4 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="truncate text-sm">
              {current.fileName} · {formatDate(current.createdAt)}
            </span>
            <div className="flex items-center gap-2">
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/10"
              >
                <a href={`/api/files/${current.id}?download=1`}>
                  <Download />
                </a>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/10"
                onClick={() => setOpen(null)}
              >
                <X />
              </Button>
            </div>
          </div>
          <div
            className="relative flex flex-1 items-center justify-center overflow-hidden p-4"
            onClick={(e) => e.stopPropagation()}
          >
            {open > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-3 text-white hover:bg-white/10"
                onClick={() => setOpen((i) => (i === null ? i : i - 1))}
              >
                <ChevronLeft className="h-7 w-7" />
              </Button>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/files/${current.id}`}
              alt={current.fileName}
              className="max-h-full max-w-full object-contain"
            />
            {open < sorted.length - 1 && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-3 text-white hover:bg-white/10"
                onClick={() => setOpen((i) => (i === null ? i : i + 1))}
              >
                <ChevronRight className="h-7 w-7" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
