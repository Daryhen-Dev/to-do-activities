import { afterEach, describe, expect, it, vi } from "vitest";
import { DEV_USER_ID, getCurrentUserId } from "./current-user";

/**
 * `NODE_ENV` is declared `readonly` in Next's global type augmentation, so
 * tests use `vi.stubEnv`/`vi.unstubAllEnvs` (Vitest's supported way to
 * mutate `process.env` for the duration of a test) instead of a direct
 * assignment.
 */
describe("getCurrentUserId", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("resolves the fixed dev user id outside production", async () => {
    vi.stubEnv("NODE_ENV", "test");

    await expect(getCurrentUserId()).resolves.toBe(DEV_USER_ID);
  });

  it("throws instead of leaking the dev stub id in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await expect(getCurrentUserId()).rejects.toThrow(/Auth\.js/);
  });
});
