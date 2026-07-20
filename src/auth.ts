import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "./auth.config";
import { authenticateUser } from "./services/auth.service";

/**
 * Auth.js (NextAuth v5) full server configuration.
 *
 * Extends the edge-safe `authConfig` (shared with the middleware) with the
 * Credentials provider, whose `authorize` callback is the only place
 * credentials are checked. It validates the shape with Zod and delegates
 * verification to the auth service (which owns the bcrypt comparison). The
 * shared `jwt`/`session` callbacks thread the user id onto the session so
 * `getCurrentUserId()` can read `session.user.id` server-side.
 *
 * `AUTH_SECRET` is read from the environment automatically.
 */

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (raw) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) {
          return null;
        }

        const user = await authenticateUser(
          parsed.data.email,
          parsed.data.password,
        );
        if (!user) {
          return null;
        }

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
});
