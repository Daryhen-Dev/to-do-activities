import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError } from "../../../../../lib/errors";

/**
 * HTTP-mapping tests: the service layer is mocked so these tests verify only
 * the calendar route's contract — range parsing, status codes, and that no
 * service/Prisma error shape leaks to the response body.
 */
vi.mock("../../../../../services/planning-item.service", () => ({
  listScheduledItemsForCategory: vi.fn(),
}));

import { listScheduledItemsForCategory } from "../../../../../services/planning-item.service";
import { GET } from "./route";

const mockList = vi.mocked(listScheduledItemsForCategory);

function context(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

/** Builds a GET Request with an optional `?from=&to=` query string. */
function calendarRequest(query?: string): Request {
  const url = query
    ? `http://localhost/api/categories/cat-1/calendar?${query}`
    : "http://localhost/api/categories/cat-1/calendar";
  return new Request(url);
}

describe("GET /api/categories/[id]/calendar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with the scheduled items for a valid range", async () => {
    const items = [{ id: "item-1" }, { id: "item-2" }];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockList.mockResolvedValue(items as any);

    const response = await GET(
      calendarRequest("from=2026-06-10T00:00:00.000Z&to=2026-06-17T00:00:00.000Z"),
      context("cat-1"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(items);
    expect(mockList).toHaveBeenCalledWith(
      "cat-1",
      new Date("2026-06-10T00:00:00.000Z"),
      new Date("2026-06-17T00:00:00.000Z"),
    );
  });

  it("returns 400 when the range is missing", async () => {
    const response = await GET(calendarRequest(), context("cat-1"));

    expect(response.status).toBe(400);
    expect(mockList).not.toHaveBeenCalled();
  });

  it("returns 400 when `to` is not after `from`", async () => {
    const response = await GET(
      calendarRequest("from=2026-06-17T00:00:00.000Z&to=2026-06-10T00:00:00.000Z"),
      context("cat-1"),
    );

    expect(response.status).toBe(400);
    expect(mockList).not.toHaveBeenCalled();
  });

  it("returns 404 when the category is not found or not owned", async () => {
    mockList.mockRejectedValue(new NotFoundError("category not found"));

    const response = await GET(
      calendarRequest("from=2026-06-10T00:00:00.000Z&to=2026-06-17T00:00:00.000Z"),
      context("cat-1"),
    );

    expect(response.status).toBe(404);
  });

  it("returns 500 without leaking the underlying error shape", async () => {
    mockList.mockRejectedValue(new Error("boom"));

    const response = await GET(
      calendarRequest("from=2026-06-10T00:00:00.000Z&to=2026-06-17T00:00:00.000Z"),
      context("cat-1"),
    );

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload).toEqual({ error: "Internal server error" });
  });
});
