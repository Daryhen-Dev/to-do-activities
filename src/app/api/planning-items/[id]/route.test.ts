import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError, ValidationError } from "../../../../lib/errors";

/**
 * HTTP-mapping tests: the service layer is mocked so these tests verify
 * only the route's contract — request parsing, param resolution, status
 * codes, and that no Prisma/service error shape leaks to the response body.
 */
vi.mock("../../../../services/planning-item.service", () => ({
  deletePlanningItemForCurrentUser: vi.fn(),
  getPlanningItemForCurrentUser: vi.fn(),
  updatePlanningItemForCurrentUser: vi.fn(),
}));

import {
  deletePlanningItemForCurrentUser,
  getPlanningItemForCurrentUser,
  updatePlanningItemForCurrentUser,
} from "../../../../services/planning-item.service";
import { DELETE, GET, PATCH } from "./route";

const mockGet = vi.mocked(getPlanningItemForCurrentUser);
const mockUpdate = vi.mocked(updatePlanningItemForCurrentUser);
const mockDelete = vi.mocked(deletePlanningItemForCurrentUser);

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/planning-items/item-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/planning-items/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with the owned item", async () => {
    const item = { id: "item-1", title: "Buy milk" };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGet.mockResolvedValue(item as any);

    const response = await GET(new Request("http://localhost"), context("item-1"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(item);
    expect(mockGet).toHaveBeenCalledWith("item-1");
  });

  it("returns 404 when the item is not found or not owned", async () => {
    mockGet.mockRejectedValue(new NotFoundError("planning item not found"));

    const response = await GET(new Request("http://localhost"), context("nope"));

    expect(response.status).toBe(404);
  });

  it("returns 500 without leaking the underlying error shape", async () => {
    mockGet.mockRejectedValue(new Error("boom"));

    const response = await GET(new Request("http://localhost"), context("item-1"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
    });
  });
});

describe("PATCH /api/planning-items/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with the updated item on a valid body", async () => {
    const updated = { id: "item-1", title: "Renamed" };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUpdate.mockResolvedValue(updated as any);

    const response = await PATCH(patchRequest({ title: "Renamed" }), context("item-1"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(updated);
    expect(mockUpdate).toHaveBeenCalledWith("item-1", { title: "Renamed" });
  });

  it("returns 400 with field errors on an invalid body", async () => {
    const response = await PATCH(patchRequest({ title: "" }), context("item-1"));

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe("Validation failed");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 when the service throws a domain ValidationError", async () => {
    mockUpdate.mockRejectedValue(new ValidationError("invalid domain input"));

    const response = await PATCH(patchRequest({ title: "ok" }), context("item-1"));

    expect(response.status).toBe(400);
  });

  it("returns 404 when the service surfaces an unknown reference or missing item", async () => {
    mockUpdate.mockRejectedValue(new NotFoundError("planning item not found"));

    const response = await PATCH(patchRequest({ title: "ok" }), context("nope"));

    expect(response.status).toBe(404);
  });

  it("returns 500 without leaking the underlying error shape", async () => {
    mockUpdate.mockRejectedValue(new Error("boom"));

    const response = await PATCH(patchRequest({ title: "ok" }), context("item-1"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
    });
  });

  // Requirement 2.2: an inconsistent schedule is a domain ValidationError the
  // service raises against the effective schedule -> 400.
  it("returns 400 when the service rejects an inconsistent schedule", async () => {
    mockUpdate.mockRejectedValue(
      new ValidationError("endAt must be on or after startAt"),
    );

    const response = await PATCH(
      patchRequest({
        startAt: "2026-08-01T11:00:00.000Z",
        endAt: "2026-08-01T10:00:00.000Z",
      }),
      context("item-1"),
    );

    expect(response.status).toBe(400);
  });

  // Requirement 2.1/2.2: a valid schedule patch is forwarded and returns 200.
  it("returns 200 with the updated item on a valid schedule", async () => {
    const updated = { id: "item-1", startAt: "2026-08-01T10:00:00.000Z" };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUpdate.mockResolvedValue(updated as any);

    const response = await PATCH(
      patchRequest({
        startAt: "2026-08-01T10:00:00.000Z",
        endAt: "2026-08-01T11:00:00.000Z",
      }),
      context("item-1"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(updated);
    expect(mockUpdate).toHaveBeenCalledWith("item-1", {
      startAt: new Date("2026-08-01T10:00:00.000Z"),
      endAt: new Date("2026-08-01T11:00:00.000Z"),
    });
  });
});

describe("DELETE /api/planning-items/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 204 with no body on success", async () => {
    mockDelete.mockResolvedValue();

    const response = await DELETE(new Request("http://localhost"), context("item-1"));

    expect(response.status).toBe(204);
    expect(mockDelete).toHaveBeenCalledWith("item-1");
  });

  it("returns 404 when the item is not found or not owned", async () => {
    mockDelete.mockRejectedValue(new NotFoundError("planning item not found"));

    const response = await DELETE(new Request("http://localhost"), context("nope"));

    expect(response.status).toBe(404);
  });

  it("returns 500 without leaking the underlying error shape", async () => {
    mockDelete.mockRejectedValue(new Error("boom"));

    const response = await DELETE(new Request("http://localhost"), context("item-1"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
    });
  });
});
