import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../../../lib/errors";

/**
 * HTTP-mapping tests: the service layer is mocked so these tests verify
 * only the route's contract — request parsing, param resolution, status
 * codes, and that no Prisma/service error shape leaks to the response body.
 */
vi.mock("../../../../services/list.service", () => ({
  deleteListForCurrentUser: vi.fn(),
  getListForCurrentUser: vi.fn(),
  updateListForCurrentUser: vi.fn(),
}));

import {
  deleteListForCurrentUser,
  getListForCurrentUser,
  updateListForCurrentUser,
} from "../../../../services/list.service";
import { DELETE, GET, PATCH } from "./route";

const mockGet = vi.mocked(getListForCurrentUser);
const mockUpdate = vi.mocked(updateListForCurrentUser);
const mockDelete = vi.mocked(deleteListForCurrentUser);

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/lists/list-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/lists/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with the owned list", async () => {
    const list = { id: "list-1", name: "Groceries" };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGet.mockResolvedValue(list as any);

    const response = await GET(new Request("http://localhost"), context("list-1"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(list);
    expect(mockGet).toHaveBeenCalledWith("list-1");
  });

  it("returns 404 when the list is not found or not owned", async () => {
    mockGet.mockRejectedValue(new NotFoundError("list not found"));

    const response = await GET(new Request("http://localhost"), context("nope"));

    expect(response.status).toBe(404);
  });

  it("returns 500 without leaking the underlying error shape", async () => {
    mockGet.mockRejectedValue(new Error("boom"));

    const response = await GET(new Request("http://localhost"), context("list-1"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
    });
  });
});

describe("PATCH /api/lists/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with the updated list on a valid body", async () => {
    const updated = { id: "list-1", name: "Renamed" };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUpdate.mockResolvedValue(updated as any);

    const response = await PATCH(patchRequest({ name: "Renamed" }), context("list-1"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(updated);
    expect(mockUpdate).toHaveBeenCalledWith("list-1", { name: "Renamed" });
  });

  it("returns 400 with field errors on an invalid body", async () => {
    const response = await PATCH(patchRequest({ name: "" }), context("list-1"));

    expect(response.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 409 on a duplicate active name in the category", async () => {
    mockUpdate.mockRejectedValue(
      new ConflictError("A list with this name already exists in this category."),
    );

    const response = await PATCH(patchRequest({ name: "Dup" }), context("list-1"));

    expect(response.status).toBe(409);
  });

  it("returns 400 when the service throws a domain ValidationError", async () => {
    mockUpdate.mockRejectedValue(new ValidationError("invalid domain input"));

    const response = await PATCH(patchRequest({ name: "ok" }), context("list-1"));

    expect(response.status).toBe(400);
  });

  it("returns 404 when the list is not found or not owned", async () => {
    mockUpdate.mockRejectedValue(new NotFoundError("list not found"));

    const response = await PATCH(patchRequest({ name: "ok" }), context("nope"));

    expect(response.status).toBe(404);
  });

  it("returns 500 without leaking the underlying error shape", async () => {
    mockUpdate.mockRejectedValue(new Error("boom"));

    const response = await PATCH(patchRequest({ name: "ok" }), context("list-1"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
    });
  });
});

describe("DELETE /api/lists/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 204 with no body on success", async () => {
    mockDelete.mockResolvedValue();

    const response = await DELETE(new Request("http://localhost"), context("list-1"));

    expect(response.status).toBe(204);
    expect(mockDelete).toHaveBeenCalledWith("list-1");
  });

  // Requirement 2.1/2.2: the route delegates deletion to the service, which
  // cascades the soft-delete to the list's tasks. The end-to-end cascade
  // (list + tasks archived together) is covered by the repository integration
  // test; here we assert the route invokes that cascading service exactly once
  // for the resolved list id.
  it("delegates to the cascading service delete for the resolved list id", async () => {
    mockDelete.mockResolvedValue();

    await DELETE(new Request("http://localhost"), context("list-42"));

    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledWith("list-42");
  });

  it("returns 404 when the list is not found or not owned", async () => {
    mockDelete.mockRejectedValue(new NotFoundError("list not found"));

    const response = await DELETE(new Request("http://localhost"), context("nope"));

    expect(response.status).toBe(404);
  });

  it("returns 500 without leaking the underlying error shape", async () => {
    mockDelete.mockRejectedValue(new Error("boom"));

    const response = await DELETE(new Request("http://localhost"), context("list-1"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
    });
  });
});
