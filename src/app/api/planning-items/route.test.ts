import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../../../lib/errors";

/**
 * HTTP-mapping tests: the service layer is mocked so these tests verify
 * only the route's contract — request parsing, status codes, and that no
 * Prisma/service error shape leaks to the response body.
 */
vi.mock("../../../services/planning-item.service", () => ({
  createPlanningItemForCurrentUser: vi.fn(),
  listPlanningItemsForCurrentUser: vi.fn(),
}));

import {
  createPlanningItemForCurrentUser,
  listPlanningItemsForCurrentUser,
} from "../../../services/planning-item.service";
import { GET, POST } from "./route";

const mockCreate = vi.mocked(createPlanningItemForCurrentUser);
const mockList = vi.mocked(listPlanningItemsForCurrentUser);

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/planning-items", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/planning-items", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 201 with the created item on a valid body", async () => {
    const created = { id: "item-1", title: "Buy milk", listId: "list-1" };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCreate.mockResolvedValue(created as any);

    const response = await POST(
      postRequest({ title: "Buy milk", listId: "list-1" }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(created);
    expect(mockCreate).toHaveBeenCalledWith({
      title: "Buy milk",
      listId: "list-1",
    });
  });

  it("returns 400 with field errors when title is missing", async () => {
    const response = await POST(
      postRequest({ description: "no title", listId: "list-1" }),
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe("Validation failed");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  // Requirement 1.1: the request is rejected with a validation error when
  // no listId is supplied, and the service is never reached.
  it("returns 400 with field errors when listId is missing", async () => {
    const response = await POST(postRequest({ title: "Buy milk" }));

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe("Validation failed");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when the service throws a domain ValidationError", async () => {
    mockCreate.mockRejectedValue(new ValidationError("invalid domain input"));

    const response = await POST(
      postRequest({ title: "Buy milk", listId: "list-1" }),
    );

    expect(response.status).toBe(400);
  });

  // Requirement 1.2: a listId the caller does not own surfaces as a 404.
  it("returns 404 when the service reports the list is not found/owned", async () => {
    mockCreate.mockRejectedValue(new NotFoundError("list not found"));

    const response = await POST(
      postRequest({ title: "Buy milk", listId: "not-owned" }),
    );

    expect(response.status).toBe(404);
  });

  it("returns 401 when the acting user is not authenticated", async () => {
    mockCreate.mockRejectedValue(
      new UnauthorizedError("Authentication required."),
    );

    const response = await POST(
      postRequest({ title: "Buy milk", listId: "list-1" }),
    );

    expect(response.status).toBe(401);
  });

  it("returns 500 without leaking the underlying error shape", async () => {
    mockCreate.mockRejectedValue(new Error("boom, prisma exploded"));

    const response = await POST(
      postRequest({ title: "Buy milk", listId: "list-1" }),
    );

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload).toEqual({ error: "Internal server error" });
  });

  it("ignores a userId sent in the body — never forwarded to the service", async () => {
    const created = { id: "item-1", title: "Buy milk", listId: "list-1" };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCreate.mockResolvedValue(created as any);

    await POST(
      postRequest({ title: "Buy milk", listId: "list-1", userId: "someone-else" }),
    );

    expect(mockCreate).toHaveBeenCalledWith({
      title: "Buy milk",
      listId: "list-1",
    });
  });
});

describe("GET /api/planning-items", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with the current user's items", async () => {
    const items = [{ id: "item-1" }, { id: "item-2" }];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockList.mockResolvedValue(items as any);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(items);
  });

  it("returns 500 without leaking the underlying error shape", async () => {
    mockList.mockRejectedValue(new Error("boom"));

    const response = await GET();

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload).toEqual({ error: "Internal server error" });
  });
});
