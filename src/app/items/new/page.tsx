import { requireApprovedUser } from "@/lib/auth-guard";
import { AppShell } from "@/components/app-shell";
import { NewItemForm } from "@/components/new-item-form";

export default async function NewItemPage() {
  const user = await requireApprovedUser();
  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-2xl animate-fade-in">
        <h1 className="text-2xl font-bold text-gradient">Add an item</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Anything you want a single source of truth for. You can add files, receipts and
          notes after creating it.
        </p>
        <div className="mt-6">
          <NewItemForm />
        </div>
      </div>
    </AppShell>
  );
}
