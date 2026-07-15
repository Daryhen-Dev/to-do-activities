import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, NotFoundError, ValidationError } from "../../../lib/errors";

/**
 * HTTP-mapping tests: the service layer is mocked so these tests verify
 * only the route's contract — request parsing, status codes, and that no
 * Prisma/service error shape leaks to the response body.
 */
vi.mock("../../../services/category.service", () => ({
  createCategoryForCurrentUser: vi.fn(),
  listCategoriesForCurrentUser: vi.fn(),
}));

import {
  createCategoryForCurrentUser,
  listCategoriesForCurrentUser,
} from "../../../services/category.service";
import { GET, POST } from "./route";

const mockCreate = vi.mocked(createCategoryForCurrentUser);
const mockList = vi.mocked(listCategoriesForCurrentUser);

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/categories", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/categories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 201 with the created category on a valid body", async () => {
    const created = { id: "cat-1", name: "Work" };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCreate.mockResolvedValue(created as any);

    const response = await POST(postRequest({ name: "Work" }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(created);
    expect(mockCreate).toHaveBeenCalledWith({ name: "Work" });
  });

  it("returns 400 with field errors when name is missing", async () => {
    const response = await POST(postRequest({ color: "#3B82F6" }));

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe("Validation failed");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when the service throws a domain ValidationError", async () => {
    mockCreate.mockRejectedValue(new ValidationError("invalid domain input"));

    const response = await POST(postRequest({ name: "Work" }));

    expect(response.status).toBe(400);
  });

  it("returns 404 when the service surfaces a not-found error", async () => {
    mockCreate.mockRejectedValue(new NotFoundError("not found"));

    const response = await POST(postRequest({ name: "Work" }));

    expect(response.status).toBe(404);
  });

  it("returns 409 when the service surfaces a duplicate active name", async () => {
    mockCreate.mockRejectedValue(
      new ConflictError("A category with this name already exists."),
    );

    const response = await POST(postRequest({ name: "Work" }));

    expect(response.status).toBe(409);
  });

  it("returns 500 without leaking the underlying error shape", async () => {
    mockCreate.mockRejectedValue(new Error("boom, prisma exploded"));

    const response = await POST(postRequest({ name: "Work" }));

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload).toEqual({ error: "Internal server error" });
  });

  it("ignores a userId sent in the body — never forwarded to the service", async () => {
    const created = { id: "cat-1", name: "Work" };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCreate.mockResolvedValue(created as any);

    await POST(postRequest({ name: "Work", userId: "someone-else" }));

    expect(mockCreate).toHaveBeenCalledWith({ name: "Work" });
  });
});

describe("GET /api/categories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with the current user's categories", async () => {
    const categories = [{ id: "cat-1" }, { id: "cat-2" }];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockList.mockResolvedValue(categories as any);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(categories);
  });

  it("returns 500 without leaking the underlying error shape", async () => {
    mockList.mockRejectedValue(new Error("boom"));

    const response = await GET();

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload).toEqual({ error: "Internal server error" });
  });
});
