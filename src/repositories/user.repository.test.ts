import { describe, expect, it } from "vitest";
import { DEV_USER_ID } from "../lib/dev-user";
import { findUserByEmail } from "./user.repository";

/**
 * Integration tests against the real, seeded Postgres instance (see
 * `docker-compose.yml` / `pnpm db:seed`). Read-only — relies on the seeded
 * dev user having a `passwordHash` set by the seed.
 */
describe("user repository (integration)", () => {
  it("finds the seeded dev user by email, including its password hash", async () => {
    const user = await findUserByEmail("dev@local.test");

    expect(user?.id).toBe(DEV_USER_ID);
    expect(user?.passwordHash).toBeTruthy();
  });

  it("returns null for an unknown email", async () => {
    const user = await findUserByEmail("does-not-exist@local.test");

    expect(user).toBeNull();
  });
});
