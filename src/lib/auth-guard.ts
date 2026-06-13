// Node-runtime guards that read the user's CURRENT status from the database, so
// approval/rejection takes effect immediately (not bound to a stale JWT).
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, type User } from "@/lib/db/schema";

export async function getCurrentUser(): Promise<User | null> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return null;
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  return user ?? null;
}

// Use in protected pages/layouts. Redirects unauthenticated → /signin and
// not-yet-approved → /pending.
export async function requireApprovedUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  if (user.status !== "approved") redirect("/pending");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireApprovedUser();
  if (user.role !== "admin") redirect("/");
  return user;
}

// For API route handlers: returns the user or null without redirecting.
export async function getApprovedUserOrNull(): Promise<User | null> {
  const user = await getCurrentUser();
  if (!user || user.status !== "approved") return null;
  return user;
}
