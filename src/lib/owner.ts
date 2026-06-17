// Resolve the single owner user for session-less entry points (the Telegram bot,
// the cron digest). This app is single-user, so the "owner" is the configured
// admin: TELEGRAM_OWNER_EMAIL, else ADMIN_EMAIL, else the project default.
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, type User } from "@/lib/db/schema";

export async function getConfiguredOwner(): Promise<User | null> {
  const email = (
    process.env.TELEGRAM_OWNER_EMAIL ||
    process.env.ADMIN_EMAIL ||
    "avikane@gmail.com"
  )
    .trim()
    .toLowerCase();
  const user = await db.query.users.findFirst({
    where: sql`lower(${users.email}) = ${email}`,
  });
  return user ?? null;
}
