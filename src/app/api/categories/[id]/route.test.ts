import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../../../lib/errors";

/**
 * HTTP-mapping tests: the service layer is mocked so these tests verify
 * only the route's contract — request parsing, status codes, and that no
 * Prisma/service error shape leaks to the response body.
 */
vi.mock("../../../../services/category.service", () => ({
  deleteCategoryForCurrentUser: vi.fn(),
  getCategoryForCurrentUser: vi.fn(),
  updateCategoryForCurrentUser: vi.fn(),
}));

import {
  deleteCategoryForCurrentUser,
  getCategoryForCurrentUser,
  updateCategoryForCurrentUser,
} from "../../../../services/category.service";
import { DELETE, GET, PATCH } from "./route";

const mockGet = vi.mocked(getCategoryForCurrentUser);
const mockUpdate = vi.mocked(updateCategoryForCurrentUser);
const mockDelete = vi.mocked(deleteCategoryForCurrentUser);

function context(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/categories/cat-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/categories/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with the category when found", async () => {
    const category = { id: "cat-1", name: "Work" };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGet.mockResolvedValue(category as any);

    const response = await GET(new Request("http://localhost"), context("cat-1"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(category);
    expect(mockGet).toHaveBeenCalledWith("cat-1");
  });

  it("returns 404 when the category is not found or not owned", async () => {
    mockGet.mockRejectedValue(new NotFoundError("category not found"));

    const response = await GET(new Request("http://localhost"), context("cat-1"));

    expect(response.status).toBe(404);
  });

  it("returns 500 without leaking the underlying error shape", async () => {
    mockGet.mockRejectedValue(new Error("boom"));

    const response = await GET(new Request("http://localhost"), context("cat-1"));

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload).toEqual({ error: "Internal server error" });
  });
});

describe("PATCH /api/categories/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with the updated category on a valid body", async () => {
    const updated = { id: "cat-1", sortOrder: 3 };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUpdate.mockResolvedValue(updated as any);

    const response = await PATCH(patchRequest({ sortOrder: 3 }), context("cat-1"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(updated);
    expect(mockUpdate).toHaveBeenCalledWith("cat-1", { sortOrder: 3 });
  });

  it("returns 400 when name is an empty string", async () => {
    const response = await PATCH(patchRequest({ name: "" }), context("cat-1"));

    expect(response.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 when the category is not found or not owned", async () => {
    mockUpdate.mockRejectedValue(new NotFoundError("category not found"));

    const response = await PATCH(patchRequest({ sortOrder: 3 }), context("cat-1"));

    expect(response.status).toBe(404);
  });

  it("returns 409 when the update collides with an existing active name", async () => {
    mockUpdate.mockRejectedValue(
      new ConflictError("A category with this name already exists."),
    );

    const response = await PATCH(patchRequest({ name: "Work" }), context("cat-1"));

    expect(response.status).toBe(409);
  });

  it("returns 400 when the service throws a domain ValidationError", async () => {
    mockUpdate.mockRejectedValue(new ValidationError("invalid domain input"));

    const response = await PATCH(patchRequest({ sortOrder: 3 }), context("cat-1"));

    expect(response.status).toBe(400);
  });
});

describe("DELETE /api/categories/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 204 on successful archive", async () => {
    mockDelete.mockResolvedValue(undefined);

    const response = await DELETE(new Request("http://localhost"), context("cat-1"));

    expect(response.status).toBe(204);
    expect(mockDelete).toHaveBeenCalledWith("cat-1");
  });

  it("returns 404 when the category is not found or not owned", async () => {
    mockDelete.mockRejectedValue(new NotFoundError("category not found"));

    const response = await DELETE(new Request("http://localhost"), context("cat-1"));

    expect(response.status).toBe(404);
  });

  it("returns 500 without leaking the underlying error shape", async () => {
    mockDelete.mockRejectedValue(new Error("boom"));

    const response = await DELETE(new Request("http://localhost"), context("cat-1"));

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload).toEqual({ error: "Internal server error" });
  });
});
