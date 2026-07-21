import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  NotFoundError,
  UnauthorizedError,
} from "../../../../../lib/errors";

/**
 * HTTP-mapping tests: the service is mocked so these verify only the
 * acknowledge route contract — status codes and that no service error shape
 * leaks. A foreign/absent id surfaces as `NotFoundError` (404, no existence
 * leak); unauthenticated as `UnauthorizedError` (401).
 */
vi.mock("../../../../../services/planning-item.service", () => ({
  acknowledgeReminderForCurrentUser: vi.fn(),
}));

import { acknowledgeReminderForCurrentUser } from "../../../../../services/planning-item.service";
import { POST } from "./route";

const mockAcknowledge = vi.mocked(acknowledgeReminderForCurrentUser);

/** Builds the route context with the async `params` shape Next provides. */
function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

const request = new Request("http://localhost/api/reminders/r-1/seen", {
  method: "POST",
});

describe("POST /api/reminders/[id]/seen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with the acknowledged item", async () => {
    const item = { id: "r-1", reminderSeenAt: "2026-08-01T09:05:00.000Z" };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockAcknowledge.mockResolvedValue(item as any);

    const response = await POST(request, context("r-1"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(item);
    expect(mockAcknowledge).toHaveBeenCalledWith("r-1");
  });

  it("returns 404 when the reminder is absent or not owned", async () => {
    mockAcknowledge.mockRejectedValue(
      new NotFoundError("planning item not found"),
    );

    const response = await POST(request, context("missing"));

    expect(response.status).toBe(404);
  });

  it("returns 401 when the request is unauthenticated", async () => {
    mockAcknowledge.mockRejectedValue(
      new UnauthorizedError("Authentication required."),
    );

    const response = await POST(request, context("r-1"));

    expect(response.status).toBe(401);
  });

  it("returns 500 without leaking the underlying error shape", async () => {
    mockAcknowledge.mockRejectedValue(new Error("boom"));

    const response = await POST(request, context("r-1"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
    });
  });
});
