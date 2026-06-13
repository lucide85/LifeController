"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Shield, ShieldOff, Loader2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDate } from "@/lib/utils";

interface Row {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: "user" | "admin";
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

export function AdminUsers({
  users,
  currentUserId,
}: {
  users: Row[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function patch(id: string, body: Record<string, string>) {
    setBusy(id);
    await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(null);
    router.refresh();
  }

  const pending = users.filter((u) => u.status === "pending");
  const others = users.filter((u) => u.status !== "pending");

  return (
    <div className="space-y-8">
      {pending.length > 0 && (
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-500">
            <Clock className="h-4 w-4" /> Awaiting approval ({pending.length})
          </h2>
          {pending.map((u) => (
            <UserRow key={u.id} u={u} busy={busy === u.id} currentUserId={currentUserId} onPatch={patch} />
          ))}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">All users</h2>
        {others.map((u) => (
          <UserRow key={u.id} u={u} busy={busy === u.id} currentUserId={currentUserId} onPatch={patch} />
        ))}
      </section>
    </div>
  );
}

function statusVariant(s: Row["status"]) {
  return s === "approved" ? "success" : s === "pending" ? "warning" : "destructive";
}

function UserRow({
  u,
  busy,
  currentUserId,
  onPatch,
}: {
  u: Row;
  busy: boolean;
  currentUserId: string;
  onPatch: (id: string, body: Record<string, string>) => void;
}) {
  const isSelf = u.id === currentUserId;
  return (
    <Card className="bg-card/60">
      <CardContent className="flex flex-wrap items-center gap-3 p-3">
        <Avatar className="h-10 w-10">
          {u.image ? <AvatarImage src={u.image} alt={u.email} /> : null}
          <AvatarFallback>{(u.name ?? u.email).slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium">{u.name ?? u.email}</p>
            {u.role === "admin" && <Badge>admin</Badge>}
            <Badge variant={statusVariant(u.status)}>{u.status}</Badge>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {u.email} · joined {formatDate(u.createdAt)}
          </p>
        </div>

        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <div className="flex flex-wrap gap-1">
            {u.status !== "approved" && (
              <Button size="sm" variant="outline" onClick={() => onPatch(u.id, { status: "approved" })}>
                <Check /> Approve
              </Button>
            )}
            {u.status !== "rejected" && !isSelf && (
              <Button size="sm" variant="ghost" onClick={() => onPatch(u.id, { status: "rejected" })}>
                <X /> Reject
              </Button>
            )}
            {!isSelf &&
              (u.role === "admin" ? (
                <Button size="sm" variant="ghost" onClick={() => onPatch(u.id, { role: "user" })}>
                  <ShieldOff /> Demote
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => onPatch(u.id, { role: "admin" })}>
                  <Shield /> Make admin
                </Button>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
