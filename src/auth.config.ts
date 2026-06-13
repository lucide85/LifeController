// Edge-safe base auth config (NO database imports). Shared by middleware and the
// full Node config in src/lib/auth.ts.
import Google from "next-auth/providers/google";
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  providers: [Google],
  // Required when running behind a reverse proxy (Caddy/Nginx) so Auth.js trusts
  // the forwarded Host header instead of throwing UntrustedHost. Safe here because
  // only our own proxy fronts the app.
  trustHost: true,
  pages: {
    signIn: "/signin",
  },
  session: { strategy: "jwt" },
  callbacks: {
    // Used by middleware to allow/deny a request. We only require an authenticated
    // session here; fine-grained approval gating happens in Node (auth-guard.ts),
    // where we can read the database for the user's current status.
    authorized({ auth }) {
      return Boolean(auth?.user);
    },
  },
} satisfies NextAuthConfig;
