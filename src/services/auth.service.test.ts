import type { User } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../repositories/user.repository", () => ({
  findUserByEmail: vi.fn(),
}));

vi.mock("bcryptjs", () => {
  const compare = vi.fn();
  const hash = vi.fn();
  return { default: { compare, hash }, compare, hash };
});

import bcrypt from "bcryptjs";
import { findUserByEmail } from "../repositories/user.repository";
import { authenticateUser } from "./auth.service";

const mockFind = vi.mocked(findUserByEmail);
const mockCompare = vi.mocked(bcrypt.compare);

function userRow(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    email: "dev@local.test",
    name: "Dev User",
    passwordHash: "hashed",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as User;
}

describe("authenticateUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a safe identity (no hash) when the password matches", async () => {
    mockFind.mockResolvedValue(userRow());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCompare.mockResolvedValue(true as any);

    const result = await authenticateUser("dev@local.test", "devpassword123");

    expect(result).toEqual({
      id: "user-1",
      email: "dev@local.test",
      name: "Dev User",
    });
    expect(mockCompare).toHaveBeenCalledWith("devpassword123", "hashed");
  });

  it("returns null for an unknown email and never compares", async () => {
    mockFind.mockResolvedValue(null);

    const result = await authenticateUser("nobody@local.test", "whatever");

    expect(result).toBeNull();
    expect(mockCompare).not.toHaveBeenCalled();
  });

  it("returns null when the user has no password set", async () => {
    mockFind.mockResolvedValue(userRow({ passwordHash: null }));

    const result = await authenticateUser("dev@local.test", "devpassword123");

    expect(result).toBeNull();
    expect(mockCompare).not.toHaveBeenCalled();
  });

  it("returns null on a password mismatch", async () => {
    mockFind.mockResolvedValue(userRow());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCompare.mockResolvedValue(false as any);

    const result = await authenticateUser("dev@local.test", "wrong");

    expect(result).toBeNull();
  });
});
