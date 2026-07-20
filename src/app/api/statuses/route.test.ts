import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * HTTP-mapping tests: the service is mocked so these tests verify only the
 * route's contract — status codes and that no error shape leaks.
 */
vi.mock("../../../services/catalog.service", () => ({
  listStatuses: vi.fn(),
}));

import { listStatuses } from "../../../services/catalog.service";
import { GET } from "./route";

const mockList = vi.mocked(listStatuses);

describe("GET /api/statuses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with the active statuses", async () => {
    const rows = [{ id: "s-1" }, { id: "s-2" }];
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
