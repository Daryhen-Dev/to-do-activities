import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DEV_USER_ID } from "../../../lib/dev-user";
import { prisma } from "../../../lib/prisma";

// Authenticate as the seeded dev user without wiring up a real session —
// this isolates the DB integration path from the Auth.js transport (and
// avoids loading next-auth in the Node/Vitest environment).
vi.mock("../../../lib/current-user", () => ({
  getCurrentUserId: vi.fn().mockResolvedValue("dev-user-000000000000000000000"),
}));

import { GET, POST } from "./route";

/**
 * End-to-end path against the real, seeded Postgres instance — no mocks.
 * Exercises route -> service -> repository -> Prisma exactly as it runs
 * in production, complementing the mocked HTTP-mapping tests in
 * `route.test.ts`.
 *
 * Every task now belongs to a list (mandatory hierarchy), so the suite
 * provisions a throwaway owned list under a seeded category.
 */

interface PlanningItemResponse {
  id: string;
  title: string;
  listId: string;
  itemTypeId: string;
  statusId: string;
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/planning-items", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("planning-items route (integration, real DB)", () => {
  const createdItemIds: string[] = [];
  let listId: string;

  beforeAll(async () => {
    const category = await prisma.category.findFirstOrThrow({
      where: { userId: DEV_USER_ID, deletedAt: null },
    });
    const list = await prisma.list.create({
      data: {
        categoryId: category.id,
        name: `route-test-list-${Date.now()}`,
      },
    });
    listId = list.id;
  });

  afterAll(async () => {
    if (createdItemIds.length > 0) {
      await prisma.planningItem.deleteMany({
        where: { id: { in: createdItemIds } },
      });
    }
    if (listId) {
      // Cascades and removes any planning items still referencing this list.
      await prisma.list.delete({ where: { id: listId } });
    }
  });

  it("creates an item via POST and returns it in a subsequent GET, scoped to the dev user", async () => {
    const uniqueTitle = `E2E route test ${Date.now()}`;

    const [seededDefaultItemType, seededDefaultStatus] = await Promise.all([
      prisma.itemType.findFirstOrThrow({ where: { isDefault: true } }),
      prisma.status.findFirstOrThrow({ where: { isDefault: true } }),
    ]);

    const postResponse = await POST(
      postRequest({ title: uniqueTitle, listId }),
    );
    expect(postResponse.status).toBe(201);
    const created = (await postResponse.json()) as PlanningItemResponse;
    createdItemIds.push(created.id);
    expect(created.title).toBe(uniqueTitle);
    expect(created.listId).toBe(listId);
    expect(created.itemTypeId).toBe(seededDefaultItemType.id);
    expect(created.statusId).toBe(seededDefaultStatus.id);

    const getResponse = await GET();
    expect(getResponse.status).toBe(200);
    const items = (await getResponse.json()) as PlanningItemResponse[];
    expect(items.some((item) => item.id === created.id)).toBe(true);
  });

  // Requirement 1.1: creating a task without a listId is rejected.
  it("returns 400 for a POST missing the required listId", async () => {
    const response = await POST(postRequest({ title: "No list here" }));

    expect(response.status).toBe(400);
  });

  // Requirement 1.2: a listId the dev user does not own (or that does not
  // exist) is rejected with a not-found.
  it("returns 404 for a POST referencing an unknown listId", async () => {
    const response = await POST(
      postRequest({ title: "Unknown list item", listId: "does-not-exist" }),
    );

    expect(response.status).toBe(404);
  });

  it("returns 404 for a POST referencing an unknown itemTypeId", async () => {
    const response = await POST(
      postRequest({
        title: "Invalid FK item",
        listId,
        itemTypeId: "does-not-exist",
      }),
    );

    expect(response.status).toBe(404);
  });

  it("returns 400 for a POST missing the required title", async () => {
    const response = await POST(
      postRequest({ description: "no title", listId }),
    );

    expect(response.status).toBe(400);
  });
});
