import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "../../../lib/errors";

/**
 * HTTP-mapping tests: the service is mocked so these verify only the reminders
 * route contract — status codes and that no service error shape leaks. The
 * acting user is resolved server-side, so unauthenticated is simulated by the
 * service throwing `UnauthorizedError`.
 */
vi.mock("../../../services/planning-item.service", () => ({
  listDueRemindersForCurrentUser: vi.fn(),
}));

import { listDueRemindersForCurrentUser } from "../../../services/planning-item.service";
import { GET } from "./route";

const mockList = vi.mocked(listDueRemindersForCurrentUser);

describe("GET /api/reminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with the due reminders", async () => {
    const items = [{ id: "r-1" }, { id: "r-2" }];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockList.mockResolvedValue(items as any);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(items);
    expect(mockList).toHaveBeenCalledTimes(1);
  });

  it("returns 200 with an empty array when there are no due reminders", async () => {
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
