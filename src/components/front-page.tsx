"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, RefreshCw, Loader2, ExternalLink, AlertTriangle, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { Markdown } from "@/components/markdown";
import { CoverDialog } from "@/components/cover-dialog";
import { RelationsCard, type LinkView } from "@/components/relations-card";

export interface RelatedItemView {
  id: string;
  title: string;
  category: string;
  location: string | null;
}

export interface FrontPageItem {
  id: string;
  title: string;
  category: string;
  description: string | null;
  summaryMd: string | null;
  summaryAtAGlance: string | null;
  summaryUpdatedAt: string | null;
  layout: string;
  fields: Record<string, string>;
  fieldsMeta: Record<string, { hero?: boolean; type?: string }>;
  fieldSources: Record<string, { source: string; sourceUrl: string | null }>;
  heroImageId: string | null;
  tags: string[];
  related: RelatedItemView[];
  links: LinkView[];
}

// A small provenance dot shown next to fields whose value came from somewhere
// other than manual entry (chat, web, an AI/document extraction).
function SourceMark({ src }: { src?: { source: string; sourceUrl: string | null } }) {
  if (!src || src.source === "manual") return null;
  const label = `From ${src.source}`;
  const dot = (
    <span
      title={label}
      className="ml-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60 align-middle"
    />
  );
  // Only link out for real http(s) URLs (never javascript:/data:).
  const safeUrl = src.sourceUrl && /^https?:\/\//i.test(src.sourceUrl) ? src.sourceUrl : null;
  return safeUrl ? (
    <a href={safeUrl} target="_blank" rel="noreferrer" title={label}>
      {dot}
    </a>
  ) : (
    dot
  );
}

// Per-archetype presentation tweaks. Keeps the layout genuinely adaptive without
// a separate component file per type: the archetype drives the hero-strip caption
// and whether the narrative summary leads (document) or the stats do.
const ARCHETYPE: Record<string, { heroLabel: string; summaryFirst?: boolean }> = {
  property: { heroLabel: "Key details" },
  vehicle: { heroLabel: "Specs" },
  travel: { heroLabel: "Trip" },
  tech: { heroLabel: "Specs" },
  vessel: { heroLabel: "Specs" },
  document: { heroLabel: "Key details", summaryFirst: true },
  generic: { heroLabel: "Key details" },
};

function formatValue(type: string | undefined, value: string) {
  if (type === "url" && /^https?:\/\//i.test(value)) {
    return (
      <a
        href={value}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-primary hover:underline"
      >
        {value.replace(/^https?:\/\//, "").slice(0, 40)} <ExternalLink className="h-3 w-3" />
      </a>
    );
  }
  if (type === "date" && !Number.isNaN(Date.parse(value))) {
    return formatDate(value);
  }
  return value;
}

export function FrontPage({ item }: { item: FrontPageItem }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coverOpen, setCoverOpen] = useState(false);

  const cfg = ARCHETYPE[item.layout] ?? ARCHETYPE.generic;
  const fieldEntries = Object.entries(item.fields ?? {});
  const heroEntries = fieldEntries.filter(([k]) => item.fieldsMeta?.[k]?.hero).slice(0, 4);
  const restEntries = fieldEntries.filter(([k]) => !item.fieldsMeta?.[k]?.hero);
  const hasSummary = Boolean(item.summaryMd);

  async function refresh() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/items/${item.id}/summary`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(typeof j.error === "string" ? j.error : "Could not generate the summary.");
      return;
    }
    router.refresh();
  }

  const summaryCard = (
    <Card className="glass">
      <CardContent className="space-y-4 p-6">
        <div className="flex items-start justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Sparkles className="h-4 w-4 text-primary" /> Summary
          </h3>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {hasSummary ? "Refresh" : "Generate"}
          </Button>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <span>{error}</span>
          </div>
        )}

        {hasSummary ? (
          <Markdown>{item.summaryMd as string}</Markdown>
        ) : (
          <p className="text-sm text-muted-foreground">
            {item.description ||
              "No summary yet. Generate one to distil this item's files, notes and specs into a living page."}
          </p>
        )}

        {item.summaryUpdatedAt && (
          <p className="text-xs text-muted-foreground">
            Updated {formatDate(item.summaryUpdatedAt)}
          </p>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      {/* Cover image */}
      {item.heroImageId ? (
        <div className="relative overflow-hidden rounded-2xl border border-border/60">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/files/${item.heroImageId}`}
            alt={item.title}
            className="h-48 w-full object-cover sm:h-60"
          />
          <Button
            variant="secondary"
            size="sm"
            className="absolute right-3 top-3"
            onClick={() => setCoverOpen(true)}
          >
            <ImageIcon /> Change cover
          </Button>
        </div>
      ) : (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setCoverOpen(true)}>
            <ImageIcon /> Add cover image
          </Button>
        </div>
      )}

      {coverOpen && (
        <CoverDialog
          itemId={item.id}
          defaultQuery={item.title}
          onClose={() => setCoverOpen(false)}
        />
      )}

      {/* At-a-glance + hero stats */}
      {(item.summaryAtAGlance || heroEntries.length > 0) && (
        <Card className="glass">
          <CardContent className="space-y-4 p-6">
            {item.summaryAtAGlance && (
              <p className="text-base font-medium leading-relaxed">{item.summaryAtAGlance}</p>
            )}
            {heroEntries.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {cfg.heroLabel}
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {heroEntries.map(([k, v]) => (
                    <div key={k} className="rounded-xl border border-border/60 bg-background/40 p-3">
                      <p className="truncate text-xs text-muted-foreground">
                        {k}
                        <SourceMark src={item.fieldSources?.[k]} />
                      </p>
                      <p className="mt-0.5 truncate font-semibold">
                        {formatValue(item.fieldsMeta?.[k]?.type, v)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {cfg.summaryFirst && summaryCard}

      {/* Specs + tags */}
      {(restEntries.length > 0 || item.tags.length > 0) && (
        <Card className="glass">
          <CardContent className="space-y-4 p-6">
            {restEntries.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Specifications</h3>
                <dl className="grid gap-2 sm:grid-cols-2">
                  {restEntries.map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3 text-sm">
                      <dt className="text-muted-foreground">
                        {k}
                        <SourceMark src={item.fieldSources?.[k]} />
                      </dt>
                      <dd className="text-right font-medium">
                        {formatValue(item.fieldsMeta?.[k]?.type, v)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
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
      )}

      {!cfg.summaryFirst && summaryCard}

      <RelationsCard itemId={item.id} related={item.related} links={item.links} />
    </div>
  );
}
