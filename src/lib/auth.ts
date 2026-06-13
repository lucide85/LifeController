// Full (Node-runtime) Auth.js config. Imported by the auth route handler, server
// actions and the auth guard — never by edge middleware.
import NextAuth from "next-auth";
import { eq } from "drizzle-orm";
import { authConfig } from "@/auth.config";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getAdminEmail } from "@/lib/settings";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    // Runs at sign-in (when `user` is set). Upsert the local user row, auto-approve
    // the configured admin email, and stash the user id on the token.
    async jwt({ token, user }) {
      if (user?.email) {
        const email = user.email.toLowerCase();
        const isAdmin = email === getAdminEmail();

        const existing = await db.query.users.findFirst({
          where: eq(users.email, email),
        });

        if (!existing) {
          const [created] = await db
            .insert(users)
            .values({
              email,
              name: user.name ?? null,
              image: user.image ?? null,
              role: isAdmin ? "admin" : "user",
              status: isAdmin ? "approved" : "pending",
              approvedAt: isAdmin ? new Date() : null,
            })
            .returning();
          token.uid = created.id;
        } else {
          // Keep the admin email promoted even if it was created earlier.
          if (isAdmin && (existing.role !== "admin" || existing.status !== "approved")) {
            await db
              .update(users)
              .set({ role: "admin", status: "approved", approvedAt: new Date() })
              .where(eq(users.id, existing.id));
          }
          token.uid = existing.id;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid && session.user) {
        (session.user as { id?: string }).id = token.uid as string;
      }
      return session;
    },
  },
});
