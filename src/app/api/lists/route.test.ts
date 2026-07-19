import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, NotFoundError } from "../../../lib/errors";

/**
 * HTTP-mapping tests: the service layer is mocked so these tests verify
 * only the route's contract — request parsing, query-param handling, status
 * codes, and that no Prisma/service error shape leaks to the response body.
 */
vi.mock("../../../services/list.service", () => ({
  createListForCurrentUser: vi.fn(),
  listListsForCategory: vi.fn(),
}));

import {
  createListForCurrentUser,
  listListsForCategory,
} from "../../../services/list.service";
import { GET, POST } from "./route";

const mockCreate = vi.mocked(createListForCurrentUser);
const mockList = vi.mocked(listListsForCategory);

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/lists", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/lists", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 201 with the created list on a valid body", async () => {
    const created = { id: "list-1", name: "Groceries", categoryId: "cat-1" };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCreate.mockResolvedValue(created as any);

    const response = await POST(
      postRequest({ categoryId: "cat-1", name: "Groceries" }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(created);
    expect(mockCreate).toHaveBeenCalledWith({
      categoryId: "cat-1",
      name: "Groceries",
    });
  });

  it("returns 400 with field errors when categoryId is missing", async () => {
    const response = await POST(postRequest({ name: "Groceries" }));

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe("Validation failed");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns 404 when the parent category is not found or not owned", async () => {
    mockCreate.mockRejectedValue(new NotFoundError("category not found"));

    const response = await POST(
      postRequest({ categoryId: "cat-x", name: "Groceries" }),
    );

    expect(response.status).toBe(404);
  });

  it("returns 409 on a duplicate active name in the category", async () => {
    mockCreate.mockRejectedValue(
      new ConflictError("A list with this name already exists in this category."),
    );

    const response = await POST(
      postRequest({ categoryId: "cat-1", name: "Groceries" }),
    );

    expect(response.status).toBe(409);
  });

  it("returns 500 without leaking the underlying error shape", async () => {
    mockCreate.mockRejectedValue(new Error("boom"));

    const response = await POST(
      postRequest({ categoryId: "cat-1", name: "Groceries" }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
    });
  });
});

describe("GET /api/lists", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with the category's lists", async () => {
    const lists = [{ id: "list-1" }, { id: "list-2" }];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockList.mockResolvedValue(lists as any);

    const response = await GET(
      new Request("http://localhost/api/lists?categoryId=cat-1"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(lists);
    expect(mockList).toHaveBeenCalledWith("cat-1");
  });

  it("returns 400 when the categoryId query param is missing", async () => {
    const response = await GET(new Request("http://localhost/api/lists"));

    expect(response.status).toBe(400);
    expect(mockList).not.toHaveBeenCalled();
  });

  it("returns 404 when the category is not found or not owned", async () => {
    mockList.mockRejectedValue(new NotFoundError("category not found"));

    const response = await GET(
      new Request("http://localhost/api/lists?categoryId=cat-x"),
    );

    expect(response.status).toBe(404);
  });

  it("returns 500 without leaking the underlying error shape", async () => {
    mockList.mockRejectedValue(new Error("boom"));

    const response = await GET(
      new Request("http://localhost/api/lists?categoryId=cat-1"),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
    });
  });
});
