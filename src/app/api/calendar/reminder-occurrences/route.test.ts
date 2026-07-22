import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "../../../../lib/errors";

/**
 * HTTP-mapping tests: the service layer is mocked so these verify only the
 * recurring-reminder range route's contract — range parsing, status codes, and
 * that no service/Prisma error shape leaks. Mirrors the habits route test.
 */
vi.mock("../../../../services/planning-item.service", () => ({
  listReminderOccurrencesForCurrentUserRange: vi.fn(),
}));

import { listReminderOccurrencesForCurrentUserRange } from "../../../../services/planning-item.service";
import { GET } from "./route";

const mockList = vi.mocked(listReminderOccurrencesForCurrentUserRange);

function req(query?: string): Request {
  const url = query
    ? `http://localhost/api/calendar/reminder-occurrences?${query}`
    : "http://localhost/api/calendar/reminder-occurrences";
  return new Request(url);
}

describe("GET /api/calendar/reminder-occurrences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with the recurring-reminder occurrences for a valid range", async () => {
    const occ = [
      { reminderId: "r-1", date: "2026-07-20" },
      { reminderId: "r-1", date: "2026-07-21" },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockList.mockResolvedValue(occ as any);

    const response = await GET(
      req("from=2026-07-20T00:00:00.000Z&to=2026-07-23T00:00:00.000Z"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(occ);
    expect(mockList).toHaveBeenCalledWith(
      new Date("2026-07-20T00:00:00.000Z"),
      new Date("2026-07-23T00:00:00.000Z"),
    );
  });

  it("returns 400 when the range is missing", async () => {
    const response = await GET(req());
    expect(response.status).toBe(400);
    expect(mockList).not.toHaveBeenCalled();
  });

  it("returns 400 when `to` is not after `from`", async () => {
    const response = await GET(
      req("from=2026-07-23T00:00:00.000Z&to=2026-07-20T00:00:00.000Z"),
    );
    expect(response.status).toBe(400);
    expect(mockList).not.toHaveBeenCalled();
  });

  it("returns 401 when the request is unauthenticated", async () => {
    mockList.mockRejectedValue(new UnauthorizedError("Authentication required."));
    const response = await GET(
      req("from=2026-07-20T00:00:00.000Z&to=2026-07-23T00:00:00.000Z"),
    );
    expect(response.status).toBe(401);
  });

  it("returns 500 without leaking the underlying error shape", async () => {
    mockList.mockRejectedValue(new Error("boom"));
    const response = await GET(
      req("from=2026-07-20T00:00:00.000Z&to=2026-07-23T00:00:00.000Z"),
    );
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
    });
  });
});
