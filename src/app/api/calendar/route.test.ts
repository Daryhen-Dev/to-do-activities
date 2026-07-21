import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "../../../lib/errors";

/**
 * HTTP-mapping tests: the service layer is mocked so these tests verify only
 * the combined calendar route's contract — range parsing, status codes, and
 * that no service/Prisma error shape leaks to the response body. Mirrors the
 * per-category calendar route test; the combined route takes no `[id]` param
 * and resolves the acting user server-side, so unauthenticated is simulated by
 * the service throwing `UnauthorizedError`.
 */
vi.mock("../../../services/planning-item.service", () => ({
  listScheduledItemsForCurrentUserRange: vi.fn(),
}));

import { listScheduledItemsForCurrentUserRange } from "../../../services/planning-item.service";
import { GET } from "./route";

const mockList = vi.mocked(listScheduledItemsForCurrentUserRange);

/** Builds a GET Request with an optional `?from=&to=` query string. */
function calendarRequest(query?: string): Request {
  const url = query
    ? `http://localhost/api/calendar?${query}`
    : "http://localhost/api/calendar";
  return new Request(url);
}

describe("GET /api/calendar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with the scheduled items for a valid range", async () => {
    const items = [
      { id: "item-1", categoryId: "cat-1" },
      { id: "item-2", categoryId: "cat-2" },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockList.mockResolvedValue(items as any);

    const response = await GET(
      calendarRequest("from=2026-07-10T00:00:00.000Z&to=2026-07-17T00:00:00.000Z"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(items);
    expect(mockList).toHaveBeenCalledWith(
      new Date("2026-07-10T00:00:00.000Z"),
      new Date("2026-07-17T00:00:00.000Z"),
    );
  });

  it("returns 400 when the range is missing", async () => {
    const response = await GET(calendarRequest());

    expect(response.status).toBe(400);
    expect(mockList).not.toHaveBeenCalled();
  });

  it("returns 400 when `from` is present but `to` is missing", async () => {
    const response = await GET(
      calendarRequest("from=2026-07-10T00:00:00.000Z"),
    );

    expect(response.status).toBe(400);
    expect(mockList).not.toHaveBeenCalled();
  });

  it("returns 400 when a boundary is not a parseable date", async () => {
    const response = await GET(
      calendarRequest("from=not-a-date&to=2026-07-17T00:00:00.000Z"),
    );

    expect(response.status).toBe(400);
    expect(mockList).not.toHaveBeenCalled();
  });

  it("returns 400 when `to` is not after `from`", async () => {
    const response = await GET(
      calendarRequest("from=2026-07-17T00:00:00.000Z&to=2026-07-10T00:00:00.000Z"),
    );

    expect(response.status).toBe(400);
    expect(mockList).not.toHaveBeenCalled();
  });

  it("returns 400 when `to` equals `from` (empty window)", async () => {
    const response = await GET(
      calendarRequest("from=2026-07-10T00:00:00.000Z&to=2026-07-10T00:00:00.000Z"),
    );

    expect(response.status).toBe(400);
    expect(mockList).not.toHaveBeenCalled();
  });

  it("returns 401 when the request is unauthenticated", async () => {
    mockList.mockRejectedValue(new UnauthorizedError("Authentication required."));

    const response = await GET(
      calendarRequest("from=2026-07-10T00:00:00.000Z&to=2026-07-17T00:00:00.000Z"),
    );

    expect(response.status).toBe(401);
  });

  it("returns 500 without leaking the underlying error shape", async () => {
    mockList.mockRejectedValue(new Error("boom"));

    const response = await GET(
      calendarRequest("from=2026-07-10T00:00:00.000Z&to=2026-07-17T00:00:00.000Z"),
    );

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload).toEqual({ error: "Internal server error" });
  });
});
