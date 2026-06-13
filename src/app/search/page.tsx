import { requireApprovedUser } from "@/lib/auth-guard";
import { AppShell } from "@/components/app-shell";
import { SearchView } from "@/components/search-view";
import { hasAnthropic } from "@/lib/ai/anthropic";
import { embeddingsEnabled } from "@/lib/ai/embeddings";

export default async function SearchPage() {
  const user = await requireApprovedUser();
  return (
    <AppShell user={user}>
      <SearchView aiEnabled={hasAnthropic()} semanticEnabled={embeddingsEnabled()} />
    </AppShell>
  );
}
