import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEV_USER_ID } from "../lib/dev-user";
import { prisma } from "../lib/prisma";
import {
  createPlanningItem,
  findDefaultItemTypeId,
  findDefaultStatusId,
  findOwnedPlanningItem,
  listPlanningItemsByUser,
  listScheduledItemsByCategory,
  softDeletePlanningItem,
  updatePlanningItem,
} from "./planning-item.repository";

/**
 * Integration tests against the real, seeded Postgres instance (see
 * `docker-compose.yml` / `pnpm db:seed`). Exercises the sole Prisma
 * boundary for the planning-item slice — every row this suite creates is
 * removed in `afterAll` so reruns stay green.
 *
 * Every task now belongs to a list (mandatory hierarchy), so the suite
 * provisions a throwaway list under a seeded category in `beforeAll` and
 * references it on every insert.
 */
describe("planning-item repository (integration)", () => {
  let itemTypeId: string;
  let statusId: string;
  let listId: string;
  const createdItemIds: string[] = [];
  let otherUserId: string | null = null;
  const throwawayUserIds: string[] = [];

  beforeAll(async () => {
    const itemType = await prisma.itemType.findFirstOrThrow({
      where: { isDefault: true },
    });
    const status = await prisma.status.findFirstOrThrow({
      where: { isDefault: true },
    });
    itemTypeId = itemType.id;
    statusId = status.id;

    // A list owned by the seeded dev user (via a seeded category) so inserts
    // satisfy the now-required listId FK.
    const category = await prisma.category.findFirstOrThrow({
      where: { userId: DEV_USER_ID, deletedAt: null },
    });
    const list = await prisma.list.create({
      data: {
        categoryId: category.id,
        name: `repo-test-list-${Date.now()}`,
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
    // Idempotent cleanup (`deleteMany`, not `delete`) so a row already removed
    // — e.g. by a cascade from parallel integration files sharing this DB —
    // does not crash the suite with "No record found for a delete".
    const userIds = [otherUserId, ...throwawayUserIds].filter(
      (id): id is string => id !== null,
    );
    if (userIds.length > 0) {
      // Cascades and removes any planning items owned by these throwaway users.
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (listId) {
      await prisma.list.deleteMany({ where: { id: listId } });
    }
  });

  it("persists a planning item associated with its list", async () => {
    const item = await createPlanningItem({
      userId: DEV_USER_ID,
      title: "Integration test: persists item",
      description: null,
      listId,
      itemTypeId,
      priorityId: null,
      statusId,
      dueAt: null,
    });
    createdItemIds.push(item.id);

    expect(item.id).toBeDefined();
    expect(item.title).toBe("Integration test: persists item");
    expect(item.listId).toBe(listId);
    expect(item.userId).toBe(DEV_USER_ID);
  });

  it("rejects an unknown itemTypeId with a NotFoundError, translating the FK violation", async () => {
    await expect(
      createPlanningItem({
        userId: DEV_USER_ID,
        title: "Should not be created",
        description: null,
        listId,
        itemTypeId: "does-not-exist",
        priorityId: null,
        statusId,
        dueAt: null,
      }),
    ).rejects.toThrow(/do not exist/);
  });

  it("rejects an unknown listId with a NotFoundError, translating the FK violation", async () => {
    await expect(
      createPlanningItem({
        userId: DEV_USER_ID,
        title: "Should not be created",
        description: null,
        listId: "does-not-exist",
        itemTypeId,
        priorityId: null,
        statusId,
        dueAt: null,
      }),
    ).rejects.toThrow(/do not exist/);
  });

  it("lists non-deleted items and excludes soft-deleted rows", async () => {
    const visible = await createPlanningItem({
      userId: DEV_USER_ID,
      title: "Integration test: visible item",
      description: null,
      listId,
      itemTypeId,
      priorityId: null,
      statusId,
      dueAt: null,
    });
    createdItemIds.push(visible.id);

    const softDeleted = await createPlanningItem({
      userId: DEV_USER_ID,
      title: "Integration test: soft-deleted item",
      description: null,
      listId,
      itemTypeId,
      priorityId: null,
      statusId,
      dueAt: null,
    });
    createdItemIds.push(softDeleted.id);
    await prisma.planningItem.update({
      where: { id: softDeleted.id },
      data: { deletedAt: new Date() },
    });

    const items = await listPlanningItemsByUser(DEV_USER_ID);
    const ids = items.map((item) => item.id);

    expect(ids).toContain(visible.id);
    expect(ids).not.toContain(softDeleted.id);
  });

  it("scopes results to the requested user only", async () => {
    const otherUser = await prisma.user.create({
      data: { email: `other-user-${Date.now()}@test.local` },
    });
    otherUserId = otherUser.id;

    const otherUsersItem = await prisma.planningItem.create({
      data: {
        userId: otherUser.id,
        title: "Integration test: another user's item",
        listId,
        itemTypeId,
        statusId,
      },
    });

    const items = await listPlanningItemsByUser(DEV_USER_ID);
    const ids = items.map((item) => item.id);

    expect(ids).not.toContain(otherUsersItem.id);
  });

  it("resolves the seeded default item type id (key: tarea), exercising the real Prisma query", async () => {
    const seededDefault = await prisma.itemType.findUniqueOrThrow({
      where: { key: "tarea" },
    });

    const resolvedId = await findDefaultItemTypeId();

    expect(resolvedId).toBe(seededDefault.id);
  });

  it("resolves the seeded default status id (isDefault: true), exercising the real Prisma query", async () => {
    const seededDefault = await prisma.status.findFirstOrThrow({
      where: { isDefault: true },
    });

    const resolvedId = await findDefaultStatusId();

    expect(resolvedId).toBe(seededDefault.id);
  });

  it("returns an empty list for a freshly created user with zero items", async () => {
    const freshUser = await prisma.user.create({
      data: { email: `empty-list-${Date.now()}@test.local` },
    });
    throwawayUserIds.push(freshUser.id);

    const items = await listPlanningItemsByUser(freshUser.id);

    expect(items).toEqual([]);
  });

  it("finds an owned, non-deleted item and returns null for a soft-deleted one", async () => {
    const item = await createPlanningItem({
      userId: DEV_USER_ID,
      title: "Integration test: findOwned",
      description: null,
      listId,
      itemTypeId,
      priorityId: null,
      statusId,
      dueAt: null,
    });
    createdItemIds.push(item.id);

    const found = await findOwnedPlanningItem(DEV_USER_ID, item.id);
    expect(found?.id).toBe(item.id);

    await softDeletePlanningItem(item.id);
    const afterDelete = await findOwnedPlanningItem(DEV_USER_ID, item.id);
    expect(afterDelete).toBeNull();
  });

  it("does not find an item owned by another user", async () => {
    const stranger = await prisma.user.create({
      data: { email: `stranger-${Date.now()}@test.local` },
    });
    throwawayUserIds.push(stranger.id);

    const item = await createPlanningItem({
      userId: DEV_USER_ID,
      title: "Integration test: not yours",
      description: null,
      listId,
      itemTypeId,
      priorityId: null,
      statusId,
      dueAt: null,
    });
    createdItemIds.push(item.id);

    const found = await findOwnedPlanningItem(stranger.id, item.id);
    expect(found).toBeNull();
  });

  it("updates provided fields and clears a nullable field with null", async () => {
    const dueAt = new Date("2026-09-01T12:00:00.000Z");
    const item = await createPlanningItem({
      userId: DEV_USER_ID,
      title: "Integration test: update me",
      description: "before",
      listId,
      itemTypeId,
      priorityId: null,
      statusId,
      dueAt,
    });
    createdItemIds.push(item.id);

    const updated = await updatePlanningItem(item.id, {
      title: "after",
      description: null,
      archived: true,
    });

    expect(updated.title).toBe("after");
    expect(updated.description).toBeNull();
    expect(updated.archived).toBe(true);
    expect(updated.dueAt?.toISOString()).toBe(dueAt.toISOString());
  });

  it("rejects an update with an unknown statusId, translating the FK violation", async () => {
    const item = await createPlanningItem({
      userId: DEV_USER_ID,
      title: "Integration test: bad update",
      description: null,
      listId,
      itemTypeId,
      priorityId: null,
      statusId,
      dueAt: null,
    });
    createdItemIds.push(item.id);

    await expect(
      updatePlanningItem(item.id, { statusId: "does-not-exist" }),
    ).rejects.toThrow(/do not exist/);
  });
});

/**
 * Integration tests for the calendar range query. Provisions two lists under
 * two owned categories in `beforeAll` (one is the "other" category used to
 * prove category scoping) and seeds items whose schedules straddle a fixed
 * `[from, to)` window. Every row created here is removed in `afterAll`.
 */
describe("listScheduledItemsByCategory (integration)", () => {
  let itemTypeId: string;
  let statusId: string;
  let listId: string;
  let otherListId: string;
  const createdItemIds: string[] = [];

  // Two STABLE seeded categories (fixed ids from `seed.ts`) — the category
  // under test and a second one used to prove category scoping. We deliberately
  // do NOT create/delete a category here: a freshly-created DEV-owned category
  // can be picked by a parallel integration file's `findFirst` and then
  // cascade-deleted when we clean up, corrupting that file's data. Referencing
  // stable seeded categories and only managing our own lists/items keeps the
  // suite deterministic under parallel file execution.
  const categoryId = "dev-cat-trabajo";
  const otherCategoryId = "dev-cat-personal";

  // Fixed window: [from, to). Chosen far in the future to avoid colliding
  // with any seeded scheduling data.
  const from = new Date("2026-06-10T00:00:00.000Z");
  const to = new Date("2026-06-17T00:00:00.000Z");

  beforeAll(async () => {
    const itemType = await prisma.itemType.findFirstOrThrow({
      where: { isDefault: true },
    });
    const status = await prisma.status.findFirstOrThrow({
      where: { isDefault: true },
    });
    itemTypeId = itemType.id;
    statusId = status.id;

    const list = await prisma.list.create({
      data: { categoryId, name: `cal-test-list-${Date.now()}` },
    });
    listId = list.id;

    // A list under the second seeded category, used to prove the query is
    // scoped to a single category (its scheduled item must be excluded).
    const otherList = await prisma.list.create({
      data: { categoryId: otherCategoryId, name: `cal-test-other-list-${Date.now()}` },
    });
    otherListId = otherList.id;
  });

  afterAll(async () => {
    if (createdItemIds.length > 0) {
      await prisma.planningItem.deleteMany({
        where: { id: { in: createdItemIds } },
      });
    }
    // Idempotent: only our own throwaway lists are removed; the seeded
    // categories are left intact.
    const listIds = [listId, otherListId].filter(
      (id): id is string => Boolean(id),
    );
    if (listIds.length > 0) {
      await prisma.list.deleteMany({ where: { id: { in: listIds } } });
    }
  });

  async function seedItem(data: {
    title: string;
    listId: string;
    startAt: Date | null;
    endAt?: Date | null;
    dueAt?: Date | null;
    deletedAt?: Date | null;
  }) {
    const item = await prisma.planningItem.create({
      data: {
        userId: DEV_USER_ID,
        title: data.title,
        listId: data.listId,
        itemTypeId,
        statusId,
        startAt: data.startAt,
        endAt: data.endAt ?? null,
        dueAt: data.dueAt ?? null,
        deletedAt: data.deletedAt ?? null,
      },
    });
    createdItemIds.push(item.id);
    return item;
  }

  it("returns only scheduled, in-range, same-category items and orders them by startAt", async () => {
    // INCLUDED: a point item whose start falls inside the window.
    const inRange = await seedItem({
      title: "cal: in-range point item",
      listId,
      startAt: new Date("2026-06-12T10:00:00.000Z"),
    });

    // INCLUDED: a ranged event that starts BEFORE the window but ends inside
    // it — overlap crossing the `from` boundary.
    const crossingBoundary = await seedItem({
      title: "cal: multi-day crossing the from boundary",
      listId,
      startAt: new Date("2026-06-08T09:00:00.000Z"),
      endAt: new Date("2026-06-11T09:00:00.000Z"),
    });

    // EXCLUDED: unscheduled item (no startAt, deadline only).
    const unscheduled = await seedItem({
      title: "cal: unscheduled (dueAt only)",
      listId,
      startAt: null,
      dueAt: new Date("2026-06-12T10:00:00.000Z"),
    });

    // EXCLUDED: soft-deleted, otherwise in-range.
    const softDeleted = await seedItem({
      title: "cal: soft-deleted in-range",
      listId,
      startAt: new Date("2026-06-13T10:00:00.000Z"),
      deletedAt: new Date(),
    });

    // EXCLUDED: scheduled and in-range but under a different category.
    const otherCategoryItem = await seedItem({
      title: "cal: other category in-range",
      listId: otherListId,
      startAt: new Date("2026-06-12T10:00:00.000Z"),
    });

    // EXCLUDED: starts on/after the `to` boundary (outside the window).
    const afterWindow = await seedItem({
      title: "cal: starts after the to boundary",
      listId,
      startAt: new Date("2026-06-20T10:00:00.000Z"),
    });

    const items = await listScheduledItemsByCategory(
      DEV_USER_ID,
      categoryId,
      from,
      to,
    );
    const ids = items.map((item) => item.id);

    expect(ids).toContain(inRange.id);
    expect(ids).toContain(crossingBoundary.id);
    expect(ids).not.toContain(unscheduled.id);
    expect(ids).not.toContain(softDeleted.id);
    expect(ids).not.toContain(otherCategoryItem.id);
    expect(ids).not.toContain(afterWindow.id);

    // Ordered by startAt asc: the boundary-crossing event (starts 06-08)
    // precedes the in-range point item (starts 06-12).
    expect(ids.indexOf(crossingBoundary.id)).toBeLessThan(
      ids.indexOf(inRange.id),
    );
  });
});
