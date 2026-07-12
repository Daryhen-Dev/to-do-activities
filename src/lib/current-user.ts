/**
 * Current-user resolution.
 *
 * This is the ONLY source of "who is the acting user" for the API. Auth.js
 * is not wired up yet, so every request is treated as the single seeded
 * dev user (see `src/prisma/seed.ts`, which upserts a User row with this
 * exact id).
 *
 * When Auth.js lands, only the body of `getCurrentUserId()` changes (e.g.
 * reading `session.user.id` from the request context) — the signature
 * (async, resolves to a user id string) and every caller stay identical.
 * The function is already `async` for that reason, even though the current
 * stub implementation is synchronous under the hood.
 */
export const DEV_USER_ID = "dev-user-000000000000000000000";

export async function getCurrentUserId(): Promise<string> {
  return DEV_USER_ID;
}
