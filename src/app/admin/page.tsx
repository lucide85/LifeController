import { desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { AppShell } from "@/components/app-shell";
import { AdminUsers } from "@/components/admin-users";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const me = await requireAdmin();

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      image: users.image,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));

  return (
    <AppShell user={me}>
      <div className="mx-auto max-w-4xl animate-fade-in">
        <h1 className="text-2xl font-bold text-gradient">Admin · Users</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Approve who can access the library. New Google sign-ins start as “pending”.
        </p>
        <div className="mt-6">
          <AdminUsers
            currentUserId={me.id}
            users={rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))}
          />
        </div>
      </div>
    </AppShell>
  );
}
