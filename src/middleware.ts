// Edge middleware: require an authenticated session for app routes. Approval
// gating (pending/rejected) is enforced server-side in auth-guard.ts.
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

export const { auth: middleware } = NextAuth(authConfig);

export default middleware((req) => {
  const isLoggedIn = Boolean(req.auth?.user);
  const { pathname } = req.nextUrl;

  const isPublic =
    pathname === "/signin" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico";

  if (!isLoggedIn && !isPublic) {
    const url = new URL("/signin", req.nextUrl.origin);
    return Response.redirect(url);
  }
});

export const config = {
  // Run only on PAGE routes. Exclude ALL /api so middleware never intercepts the
  // Auth.js endpoints (/api/auth/*) — intercepting them redirected the sign-in
  // fetches to /signin (HTML), which broke login. Our own API routes (items,
  // search, files, admin) enforce auth themselves and return JSON 401/403.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
