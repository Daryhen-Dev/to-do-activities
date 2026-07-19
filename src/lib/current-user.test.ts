import { afterEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "./errors";

/**
 * `getCurrentUserId` resolves the acting user from the Auth.js session, so
 * the `auth()` call is mocked here to drive the three branches: an
 * authenticated session, no session at all, and a session missing the id.
 */
vi.mock("../auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "../auth";
import { getCurrentUserId } from "./current-user";

const mockAuth = vi.mocked(auth);

describe("getCurrentUserId", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns the signed-in user's id from the session", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockAuth.mockResolvedValue({ user: { id: "user-42" } } as any);

    await expect(getCurrentUserId()).resolves.toBe("user-42");
  });

  it("throws UnauthorizedError when there is no session", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockAuth.mockResolvedValue(null as any);

    await expect(getCurrentUserId()).rejects.toThrow(UnauthorizedError);
  });

  it("throws UnauthorizedError when the session carries no user id", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockAuth.mockResolvedValue({ user: {} } as any);

    await expect(getCurrentUserId()).rejects.toThrow(UnauthorizedError);
  });
});
