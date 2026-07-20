import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * HTTP-mapping tests: the service is mocked so these tests verify only the
 * route's contract — status codes and that no error shape leaks.
 */
vi.mock("../../../services/catalog.service", () => ({
  listPriorities: vi.fn(),
}));

import { listPriorities } from "../../../services/catalog.service";
import { GET } from "./route";

const mockList = vi.mocked(listPriorities);

describe("GET /api/priorities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with the active priorities", async () => {
    const rows = [{ id: "p-1" }, { id: "p-2" }];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockList.mockResolvedValue(rows as any);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(rows);
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
