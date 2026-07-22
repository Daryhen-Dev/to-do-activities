import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../../../../../lib/errors";

/**
 * HTTP-mapping tests: the service is mocked so these verify only the
 * completions route contract — body parsing, param resolution, status codes,
 * and that no service/Prisma error shape leaks.
 */
vi.mock("../../../../../services/planning-item.service", () => ({
  setHabitCompletionForCurrentUser: vi.fn(),
}));

import { setHabitCompletionForCurrentUser } from "../../../../../services/planning-item.service";
import { DELETE, POST } from "./route";

const mockSet = vi.mocked(setHabitCompletionForCurrentUser);

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

function req(body: unknown, method: "POST" | "DELETE"): Request {
  return new Request("http://localhost/api/habits/h-1/completions", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/habits/[id]/completions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 and records the completion on a valid body", async () => {
    mockSet.mockResolvedValue(undefined);

    const response = await POST(req({ date: "2026-07-20" }, "POST"), context("h-1"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      date: "2026-07-20",
      completed: true,
    });
    expect(mockSet).toHaveBeenCalledWith("h-1", "2026-07-20", true);
  });

  it("returns 400 on a malformed date body", async () => {
    const response = await POST(req({ date: "20-07-2026" }, "POST"), context("h-1"));
    expect(response.status).toBe(400);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("returns 400 when the date is not a scheduled occurrence", async () => {
    mockSet.mockRejectedValue(new ValidationError("date is not a scheduled occurrence"));

    const response = await POST(req({ date: "2026-07-21" }, "POST"), context("h-1"));

    expect(response.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    mockSet.mockRejectedValue(new UnauthorizedError("Authentication required."));

    const response = await POST(req({ date: "2026-07-20" }, "POST"), context("h-1"));

    expect(response.status).toBe(401);
  });

  it("returns 404 when the habit is not owned", async () => {
    mockSet.mockRejectedValue(new NotFoundError("habit not found"));

    const response = await POST(req({ date: "2026-07-20" }, "POST"), context("nope"));

    expect(response.status).toBe(404);
  });

  it("returns 500 without leaking the underlying error shape", async () => {
    mockSet.mockRejectedValue(new Error("boom"));

    const response = await POST(req({ date: "2026-07-20" }, "POST"), context("h-1"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
    });
  });
});

describe("DELETE /api/habits/[id]/completions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 and removes the completion on a valid body", async () => {
    mockSet.mockResolvedValue(undefined);

    const response = await DELETE(req({ date: "2026-07-20" }, "DELETE"), context("h-1"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      date: "2026-07-20",
      completed: false,
    });
    expect(mockSet).toHaveBeenCalledWith("h-1", "2026-07-20", false);
  });

  it("returns 400 on a malformed date body", async () => {
    const response = await DELETE(req({ date: "nope" }, "DELETE"), context("h-1"));
    expect(response.status).toBe(400);
    expect(mockSet).not.toHaveBeenCalled();
  });
});
