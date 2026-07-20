import type { DefaultSession } from "next-auth";

/**
 * Module augmentation so the acting user's id is typed on both the session
 * and the JWT. Populated by the `jwt`/`session` callbacks in `src/auth.ts`.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
  }
}
