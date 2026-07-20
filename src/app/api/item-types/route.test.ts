import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * HTTP-mapping tests: the service is mocked so these tests verify only the
 * route's contract — status codes and that no error shape leaks.
 */
vi.mock("../../../services/catalog.service", () => ({
  listItemTypes: vi.fn(),
}));

import { listItemTypes } from "../../../services/catalog.service";
import { GET } from "./route";

const mockList = vi.mocked(listItemTypes);

describe("GET /api/item-types", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with the active item types", async () => {
    const rows = [{ id: "it-1" }, { id: "it-2" }];
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
