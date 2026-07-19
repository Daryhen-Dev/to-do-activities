import { auth } from "../auth";
import { UnauthorizedError } from "./errors";

/**
 * Current-user resolution — the single source of "who is the acting user"
 * for the API. Every service resolves ownership through this function, so
 * it is also the one place that enforces authentication.
 *
 * It reads the Auth.js (NextAuth v5) session server-side and returns the
 * signed-in user's id, throwing `UnauthorizedError` (mapped to HTTP 401 by
 * the route handlers) when there is no authenticated session. The signature
 * — async, resolves to a user id string — is unchanged from the earlier dev
 * stub, so every caller stayed identical when real auth landed.
 */

export async function getCurrentUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    throw new UnauthorizedError("Authentication required.");
  }

  return userId;
}
