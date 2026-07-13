import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../../../lib/prisma";
import { GET, POST } from "./route";

/**
 * End-to-end path against the real, seeded Postgres instance — no mocks.
 * Exercises route -> service -> repository -> Prisma exactly as it runs
 * in production, complementing the mocked HTTP-mapping tests in
 * `route.test.ts`.
 */

interface PlanningItemResponse {
  id: string;
  title: string;
  listId: string | null;
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

  afterAll(async () => {
    if (createdItemIds.length > 0) {
      await prisma.planningItem.deleteMany({
        where: { id: { in: createdItemIds } },
      });
    }
  });

  it("creates an item via POST and returns it in a subsequent GET, scoped to the dev user", async () => {
    const uniqueTitle = `E2E route test ${Date.now()}`;

    const postResponse = await POST(postRequest({ title: uniqueTitle }));
    expect(postResponse.status).toBe(201);
    const created = (await postResponse.json()) as PlanningItemResponse;
    createdItemIds.push(created.id);
    expect(created.title).toBe(uniqueTitle);
    expect(created.listId).toBeNull();

    const getResponse = await GET();
    expect(getResponse.status).toBe(200);
    const items = (await getResponse.json()) as PlanningItemResponse[];
    expect(items.some((item) => item.id === created.id)).toBe(true);
  });

  it("returns 404 for a POST referencing an unknown itemTypeId", async () => {
    const response = await POST(
      postRequest({ title: "Invalid FK item", itemTypeId: "does-not-exist" }),
    );

    expect(response.status).toBe(404);
  });

  it("returns 400 for a POST missing the required title", async () => {
    const response = await POST(postRequest({ description: "no title" }));

    expect(response.status).toBe(400);
  });
});
