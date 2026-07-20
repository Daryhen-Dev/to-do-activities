import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js configuration shared between the middleware and the full
 * server config (`src/auth.ts`).
 *
 * This file must NOT import anything Node-only (Prisma, bcrypt, the auth
 * service): the middleware bundles it for the Edge runtime, where it only
 * verifies the stateless JWT — it never touches the database. The
 * DB-backed Credentials `authorize` lives in `src/auth.ts`, which spreads
 * this config and appends the provider.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && typeof token.id === "string") {
        session.user.id = token.id;
      }
      return session;
    },
    /**
     * Page-level gate run by the middleware. Unauthenticated visitors are
     * redirected to `/login` (via `pages.signIn`); an already-authenticated
     * visitor hitting `/login` is bounced to the app root.
     */
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnLogin = nextUrl.pathname.startsWith("/login");

      if (isOnLogin) {
        if (isLoggedIn) {
          return Response.redirect(new URL("/", nextUrl));
        }
        return true;
      }

      return isLoggedIn;
    },
  },
} satisfies NextAuthConfig;
