import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "../../../../lib/errors";

/**
 * HTTP-mapping tests: the service layer is mocked so these verify only the
 * reminders range route's contract — range parsing, status codes, and that no
 * service/Prisma error shape leaks. Mirrors the scheduled `/api/calendar` route
 * test; the acting user is resolved server-side, so unauthenticated is
 * simulated by the service throwing `UnauthorizedError`.
 */
vi.mock("../../../../services/planning-item.service", () => ({
  listRemindersForCurrentUserRange: vi.fn(),
}));

import { listRemindersForCurrentUserRange } from "../../../../services/planning-item.service";
import { GET } from "./route";

const mockList = vi.mocked(listRemindersForCurrentUserRange);

/** Builds a GET Request with an optional `?from=&to=` query string. */
function remindersRequest(query?: string): Request {
  const url = query
    ? `http://localhost/api/calendar/reminders?${query}`
    : "http://localhost/api/calendar/reminders";
  return new Request(url);
}

describe("GET /api/calendar/reminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with the reminders for a valid range", async () => {
    const items = [
      { id: "r-1", categoryId: "cat-1" },
      { id: "r-2", categoryId: "cat-2" },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockList.mockResolvedValue(items as any);

    const response = await GET(
      remindersRequest("from=2026-11-01T00:00:00.000Z&to=2026-11-08T00:00:00.000Z"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(items);
    expect(mockList).toHaveBeenCalledWith(
      new Date("2026-11-01T00:00:00.000Z"),
      new Date("2026-11-08T00:00:00.000Z"),
    );
  });

  it("returns 400 when the range is missing", async () => {
    const response = await GET(remindersRequest());

    expect(response.status).toBe(400);
    expect(mockList).not.toHaveBeenCalled();
  });

  it("returns 400 when a boundary is not a parseable date", async () => {
    const response = await GET(
      remindersRequest("from=not-a-date&to=2026-11-08T00:00:00.000Z"),
    );

    expect(response.status).toBe(400);
    expect(mockList).not.toHaveBeenCalled();
  });

  it("returns 400 when `to` is not after `from`", async () => {
    const response = await GET(
      remindersRequest("from=2026-11-08T00:00:00.000Z&to=2026-11-01T00:00:00.000Z"),
    );

    expect(response.status).toBe(400);
    expect(mockList).not.toHaveBeenCalled();
  });

  it("returns 401 when the request is unauthenticated", async () => {
    mockList.mockRejectedValue(new UnauthorizedError("Authentication required."));

    const response = await GET(
      remindersRequest("from=2026-11-01T00:00:00.000Z&to=2026-11-08T00:00:00.000Z"),
    );

    expect(response.status).toBe(401);
  });

  it("returns 500 without leaking the underlying error shape", async () => {
    mockList.mockRejectedValue(new Error("boom"));

    const response = await GET(
      remindersRequest("from=2026-11-01T00:00:00.000Z&to=2026-11-08T00:00:00.000Z"),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
    });
  });
});
