import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "../../../lib/errors";

/**
 * HTTP-mapping tests: the service is mocked so these verify only the habits
 * route contract — status codes and that no service/Prisma error shape leaks.
 * The acting user is resolved server-side, so unauthenticated is simulated by
 * the service throwing `UnauthorizedError`.
 */
vi.mock("../../../services/planning-item.service", () => ({
  listHabitsForCurrentUser: vi.fn(),
}));

import { listHabitsForCurrentUser } from "../../../services/planning-item.service";
import { GET } from "./route";

const mockList = vi.mocked(listHabitsForCurrentUser);

describe("GET /api/habits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with the habits", async () => {
    const habits = [
      { id: "h-1", streak: 3, weekly: { completed: 2, total: 5 } },
      { id: "h-2", streak: 0, weekly: { completed: 0, total: 0 } },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockList.mockResolvedValue(habits as any);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(habits);
    expect(mockList).toHaveBeenCalledTimes(1);
  });

  it("returns 200 with an empty array when there are no habits", async () => {
    mockList.mockResolvedValue([]);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
  });

  it("returns 401 with no item data when unauthenticated", async () => {
    mockList.mockRejectedValue(new UnauthorizedError("Authentication required."));

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("returns 500 without leaking the underlying error shape", async () => {
    mockList.mockRejectedValue(new Error("boom"));

    const response = await GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
    });
  });
});
