"use client";

import { Download, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface PreviewAttachment {
  id: string;
  fileName: string;
  mimeType: string;
}

export function FilePreview({
  attachment,
  onOpenChange,
}: {
  attachment: PreviewAttachment | null;
  onOpenChange: (open: boolean) => void;
}) {
  const src = attachment ? `/api/files/${attachment.id}` : "";
  const isImage = attachment?.mimeType.startsWith("image/");
  const isPdf = attachment?.mimeType === "application/pdf";
  const isText =
    attachment?.mimeType.startsWith("text/") || attachment?.mimeType === "text/markdown";

  return (
    <Dialog open={!!attachment} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-8">{attachment?.fileName}</DialogTitle>
        </DialogHeader>

        {attachment && (
          <div className="overflow-hidden rounded-lg border bg-background/40">
            {isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt={attachment.fileName} className="mx-auto max-h-[72vh] w-auto" />
            ) : isPdf || isText ? (
              <iframe src={src} title={attachment.fileName} className="h-[72vh] w-full" />
            ) : (
              <div className="p-10 text-center text-sm text-muted-foreground">
                This file type can’t be previewed inline.
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={src} target="_blank" rel="noreferrer">
              <ExternalLink /> Open in new tab
            </a>
          </Button>
          <Button asChild size="sm">
            <a href={`${src}?download=1`}>
              <Download /> Download
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
