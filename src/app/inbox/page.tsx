import { and, desc, eq } from "drizzle-orm";
import { requireApprovedUser } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { captures } from "@/lib/db/schema";
import { AppShell } from "@/components/app-shell";
import { CaptureInbox, type InboxCapture } from "@/components/capture-inbox";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const user = await requireApprovedUser();

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
      <CaptureInbox initial={initial} />
    </AppShell>
  );
}
