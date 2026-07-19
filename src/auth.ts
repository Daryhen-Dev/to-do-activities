import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authenticateUser } from "./services/auth.service";

/**
 * Auth.js (NextAuth v5) configuration.
 *
 * Strategy: Credentials provider + stateless JWT sessions. The `authorize`
 * callback is the only place credentials are checked — it validates the
 * shape with Zod and delegates the actual verification to the auth service
 * (which owns the bcrypt comparison). The resolved user id is threaded into
 * the JWT (`jwt` callback) and surfaced on the session (`session` callback)
 * so `getCurrentUserId()` can read `session.user.id` server-side.
 *
 * `AUTH_SECRET` is read from the environment automatically.
 */

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
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
  },
});
