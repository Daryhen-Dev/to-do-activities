import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "../../../lib/errors";

/**
 * HTTP-mapping tests: the service is mocked so these verify only the notes
 * route contract — status codes and that no service/Prisma error shape leaks.
 * The acting user is resolved server-side, so unauthenticated is simulated by
 * the service throwing `UnauthorizedError`.
 */
vi.mock("../../../services/planning-item.service", () => ({
  listNotesForCurrentUser: vi.fn(),
}));

import { listNotesForCurrentUser } from "../../../services/planning-item.service";
import { GET } from "./route";

const mockList = vi.mocked(listNotesForCurrentUser);

describe("GET /api/notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with the notes", async () => {
    const notes = [
      { id: "n-1", categoryId: "cat-1" },
      { id: "n-2", categoryId: "cat-2" },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockList.mockResolvedValue(notes as any);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(notes);
    expect(mockList).toHaveBeenCalledTimes(1);
  });

  it("returns 200 with an empty array when there are no notes", async () => {
    mockList.mockResolvedValue([]);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
  });

  it("returns 401 when the request is unauthenticated", async () => {
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
