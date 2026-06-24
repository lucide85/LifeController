"use client";

import { useEffect, useState } from "react";
import { Bookmark, Copy, Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

// A small collapsible panel that hands the owner a bookmarklet for clipping any web page
// into the capture inbox. Built against the app's own origin at runtime, so it's correct
// regardless of domain. We show it as copyable text (rather than a javascript: link) to
// sidestep React's URL sanitization and work on mobile bookmarks too.
export function ClipHelp() {
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const bookmarklet = origin
    ? `javascript:(function(){location.href='${origin}/clip?u='+encodeURIComponent(location.href)+'&t='+encodeURIComponent(document.title)})()`
    : "";

  async function copy() {
    if (!bookmarklet) return;
    try {
      await navigator.clipboard.writeText(bookmarklet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be unavailable — the code is still visible to copy manually.
    }
  }

  return (
    <div className="glass rounded-2xl p-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 text-sm font-medium"
      >
        <Bookmark className="h-4 w-4 text-primary" /> Save any web page in one click
        <ChevronDown
          className={`ml-auto h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          <p>
            Make a new browser bookmark and paste this as its address. Then, on any page,
            click it to clip that page into your inbox.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-md border border-border/60 bg-background/60 px-2 py-1 text-xs">
              {bookmarklet || "…"}
            </code>
            <Button size="sm" variant="secondary" onClick={copy} disabled={!bookmarklet}>
              {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="text-xs">
            On desktop you can drag a link to your bookmarks bar; on mobile, add any page as
            a bookmark and edit its URL to paste this in.
          </p>
        </div>
      )}
    </div>
  );
}
