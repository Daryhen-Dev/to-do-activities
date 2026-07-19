/**
 * Stable id of the seeded development user (see `src/prisma/seed.ts`).
 *
 * Lives in its own dependency-free module — deliberately NOT in
 * `current-user.ts`, which imports the Auth.js runtime. Seed scripts and
 * integration tests need only this constant, and pulling in `next-auth`
 * (and its `next/server` import) through `current-user` would break them in
 * the plain Node/Vitest environment.
 */
export const DEV_USER_ID = "dev-user-000000000000000000000";
