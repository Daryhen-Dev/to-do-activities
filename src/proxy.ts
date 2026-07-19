import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

/**
 * Route protection (Next.js 16 `proxy` convention — the former
 * `middleware.ts`). Runs the edge-safe `authConfig` (JWT verification only,
 * no DB) to gate page navigation via the `authorized` callback.
 *
 * The matcher deliberately excludes `/api/*` — API routes enforce their own
 * auth through `getCurrentUserId()` (401), and the `/api/auth/*` endpoints
 * must never be blocked — as well as Next internals and static assets.
 */
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.svg$).*)"],
};
