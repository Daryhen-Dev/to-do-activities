import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEV_USER_ID } from "../lib/dev-user";
import { prisma } from "../lib/prisma";
import {
  createPlanningItem,
  findDefaultItemTypeId,
  findDefaultStatusId,
  findOwnedPlanningItem,
  listPlanningItemsByUser,
  softDeletePlanningItem,
  updatePlanningItem,
} from "./planning-item.repository";

/**
 * Integration tests against the real, seeded Postgres instance (see
 * `docker-compose.yml` / `pnpm db:seed`). Exercises the sole Prisma
 * boundary for the planning-item slice — every row this suite creates is
 * removed in `afterAll` so reruns stay green.
 */
describe("planning-item repository (integration)", () => {
  let itemTypeId: string;
  let statusId: string;
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
  });

  afterAll(async () => {
    if (createdItemIds.length > 0) {
      await prisma.planningItem.deleteMany({
        where: { id: { in: createdItemIds } },
      });
    }
    if (otherUserId) {
      // Cascades and removes any planning items owned by this throwaway user.
      await prisma.user.delete({ where: { id: otherUserId } });
    }
    if (throwawayUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: throwawayUserIds } } });
    }
  });

  it("persists a planning item with a nullable listId", async () => {
    const item = await createPlanningItem({
      userId: DEV_USER_ID,
      title: "Integration test: persists item",
      description: null,
      listId: null,
      itemTypeId,
      priorityId: null,
      statusId,
    });
    createdItemIds.push(item.id);

    expect(item.id).toBeDefined();
    expect(item.title).toBe("Integration test: persists item");
    expect(item.listId).toBeNull();
    expect(item.userId).toBe(DEV_USER_ID);
  });

  it("rejects an unknown itemTypeId with a NotFoundError, translating the FK violation", async () => {
    await expect(
      createPlanningItem({
        userId: DEV_USER_ID,
        title: "Should not be created",
        description: null,
        listId: null,
        itemTypeId: "does-not-exist",
        priorityId: null,
        statusId,
      }),
    ).rejects.toThrow(/do not exist/);
  });

  it("lists non-deleted items and excludes soft-deleted rows", async () => {
    const visible = await createPlanningItem({
      userId: DEV_USER_ID,
      title: "Integration test: visible item",
      description: null,
      listId: null,
      itemTypeId,
      priorityId: null,
      statusId,
    });
    createdItemIds.push(visible.id);

    const softDeleted = await createPlanningItem({
      userId: DEV_USER_ID,
      title: "Integration test: soft-deleted item",
      description: null,
      listId: null,
      itemTypeId,
      priorityId: null,
      statusId,
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
      listId: null,
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
      listId: null,
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
      listId: null,
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
      listId: null,
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
