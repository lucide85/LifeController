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
  // Run on everything except Next static assets. File streaming (/api/files) does
  // its own per-user authorization check inside the route handler.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
