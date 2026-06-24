import { and, desc, eq } from "drizzle-orm";
import { requireApprovedUser } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { captures } from "@/lib/db/schema";
import { AppShell } from "@/components/app-shell";
import { CaptureInbox, type InboxCapture } from "@/components/capture-inbox";
import { ClipHelp } from "@/components/clip-help";

export const dynamic = "force-dynamic";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ shared?: string }>;
}) {
  const user = await requireApprovedUser();
  const { shared } = await searchParams;

  const rows = await db
    .select({
      id: captures.id,
      kind: captures.kind,
      rawText: captures.rawText,
      sourceUrl: captures.sourceUrl,
      sourceTitle: captures.sourceTitle,
      fileName: captures.fileName,
      mimeType: captures.mimeType,
      imageUrl: captures.imageUrl,
      extractedText: captures.extractedText,
      suggestedAction: captures.suggestedAction,
      createdAt: captures.createdAt,
    })
    .from(captures)
    .where(and(eq(captures.ownerId, user.id), eq(captures.status, "inbox")))
    .orderBy(desc(captures.createdAt))
    .limit(100);

  const initial: InboxCapture[] = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    rawText: r.rawText,
    sourceUrl: r.sourceUrl,
    sourceTitle: r.sourceTitle,
    fileName: r.fileName,
    mimeType: r.mimeType,
    imageUrl: r.imageUrl,
    extractedText: r.extractedText ? r.extractedText.slice(0, 600) : null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    suggestion: (r.suggestedAction as any) ?? null,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <AppShell user={user}>
      {shared === "1" && (
        <div className="mb-4 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-sm">
          ✅ Shared to your inbox — triaged below.
        </div>
      )}
      {shared === "partial" && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm">
          ✅ Saved what I could — some shared files were skipped (too large or unreadable).
        </div>
      )}
      {shared === "error" && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm">
          ⚠️ Couldn&apos;t save the shared item. Try again, or add it from here.
        </div>
      )}
      {shared === "empty" && (
        <div className="mb-4 rounded-lg border border-border/60 bg-card/50 px-4 py-2 text-sm">
          There was nothing to save from that share.
        </div>
      )}
      <CaptureInbox initial={initial} />
      <div className="mt-6">
        <ClipHelp />
      </div>
    </AppShell>
  );
}
