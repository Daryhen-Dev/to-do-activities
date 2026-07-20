import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEV_USER_ID } from "../lib/dev-user";
import { ConflictError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import {
  createList,
  findOwnedList,
  listActiveListsByCategory,
  listActiveListsByUser,
  softDeleteListWithTasks,
  updateList,
} from "./list.repository";

/**
 * Integration tests against the real, seeded Postgres instance (see
 * `docker-compose.yml` / `pnpm db:seed`). Exercises the sole Prisma
 * boundary for the list slice — including the indirect-ownership join
 * through the parent category. Every row this suite creates is removed in
 * `afterAll` so reruns stay green.
 */
describe("list repository (integration)", () => {
  // `dev-cat-trabajo` is a seeded category owned by DEV_USER_ID.
  const categoryId = "dev-cat-trabajo";
  const createdListIds: string[] = [];
  let strangerUserId: string | null = null;
  // Seeded catalog rows — the seed provisions item types and statuses but no
  // tasks/lists, so tasks provisioned here reference these default ids.
  let defaultItemTypeId: string;
  let defaultStatusId: string;

  beforeAll(async () => {
    await prisma.category.findUniqueOrThrow({ where: { id: categoryId } });
    const [itemType, status] = await Promise.all([
      prisma.itemType.findFirstOrThrow({ where: { isDefault: true } }),
      prisma.status.findFirstOrThrow({ where: { isDefault: true } }),
    ]);
    defaultItemTypeId = itemType.id;
    defaultStatusId = status.id;
  });

  afterAll(async () => {
    if (createdListIds.length > 0) {
      await prisma.list.deleteMany({ where: { id: { in: createdListIds } } });
    }
    if (strangerUserId) {
      // Cascades and removes the stranger's category + lists.
      await prisma.user.delete({ where: { id: strangerUserId } });
    }
  });

  it("persists a list and reads it back scoped to its category", async () => {
    const list = await createList({
      categoryId,
      name: `Integration list ${Date.now()}`,
      sortOrder: 1,
    });
    createdListIds.push(list.id);

    const lists = await listActiveListsByCategory(categoryId);
    expect(lists.map((item) => item.id)).toContain(list.id);
  });

  it("rejects a duplicate ACTIVE name in the same category with a ConflictError", async () => {
    const name = `Dup list ${Date.now()}`;
    const first = await createList({ categoryId, name, sortOrder: undefined });
    createdListIds.push(first.id);

    await expect(
      createList({ categoryId, name, sortOrder: undefined }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("finds an owned list and returns null once it is soft-deleted", async () => {
    const list = await createList({
      categoryId,
      name: `Owned list ${Date.now()}`,
      sortOrder: undefined,
    });
    createdListIds.push(list.id);

    const found = await findOwnedList(DEV_USER_ID, list.id);
    expect(found?.id).toBe(list.id);

    await softDeleteListWithTasks(list.id);
    const afterDelete = await findOwnedList(DEV_USER_ID, list.id);
    expect(afterDelete).toBeNull();

    // Soft-deleted rows are excluded from the category listing too.
    const lists = await listActiveListsByCategory(categoryId);
    expect(lists.map((item) => item.id)).not.toContain(list.id);
  });

  it("does not find a list whose category belongs to another user", async () => {
    const stranger = await prisma.user.create({
      data: { email: `list-stranger-${Date.now()}@test.local` },
    });
    strangerUserId = stranger.id;
    const strangerCategory = await prisma.category.create({
      data: { userId: stranger.id, name: "Stranger cat" },
    });
    const strangerList = await prisma.list.create({
      data: { categoryId: strangerCategory.id, name: "Stranger list" },
    });

    const found = await findOwnedList(DEV_USER_ID, strangerList.id);
    expect(found).toBeNull();
  });

  it("updates a list's name", async () => {
    const list = await createList({
      categoryId,
      name: `Rename me ${Date.now()}`,
      sortOrder: undefined,
    });
    createdListIds.push(list.id);

    const renamed = `Renamed ${Date.now()}`;
    const updated = await updateList(list.id, { name: renamed });

    expect(updated.name).toBe(renamed);
  });

  it("lists all of a user's lists across categories, excluding soft-deleted", async () => {
    const live = await createList({
      categoryId,
      name: `All-lists live ${Date.now()}`,
      sortOrder: undefined,
    });
    createdListIds.push(live.id);

    const gone = await createList({
      categoryId,
      name: `All-lists deleted ${Date.now()}`,
      sortOrder: undefined,
    });
    createdListIds.push(gone.id);
    await softDeleteListWithTasks(gone.id);

    const lists = await listActiveListsByUser(DEV_USER_ID);
    const ids = lists.map((item) => item.id);

    expect(ids).toContain(live.id);
    expect(ids).not.toContain(gone.id);
  });

  it("soft-deletes the list and all of its active tasks in one transaction", async () => {
    const list = await createList({
      categoryId,
      name: `Cascade list ${Date.now()}`,
      sortOrder: undefined,
    });
    createdListIds.push(list.id);

    const [taskA, taskB] = await Promise.all([
      prisma.planningItem.create({
        data: {
          userId: DEV_USER_ID,
          listId: list.id,
          itemTypeId: defaultItemTypeId,
          statusId: defaultStatusId,
          title: `Cascade task A ${Date.now()}`,
        },
      }),
      prisma.planningItem.create({
        data: {
          userId: DEV_USER_ID,
          listId: list.id,
          itemTypeId: defaultItemTypeId,
          statusId: defaultStatusId,
          title: `Cascade task B ${Date.now()}`,
        },
      }),
    ]);

    await softDeleteListWithTasks(list.id);

    const [deletedList, deletedA, deletedB] = await Promise.all([
      prisma.list.findUniqueOrThrow({ where: { id: list.id } }),
      prisma.planningItem.findUniqueOrThrow({ where: { id: taskA.id } }),
      prisma.planningItem.findUniqueOrThrow({ where: { id: taskB.id } }),
    ]);

    expect(deletedList.deletedAt).not.toBeNull();
    expect(deletedA.deletedAt).not.toBeNull();
    expect(deletedB.deletedAt).not.toBeNull();
    // The list and its active tasks share the same `now`, so their
    // `deletedAt` timestamps are identical.
    expect(deletedA.deletedAt?.getTime()).toBe(deletedList.deletedAt?.getTime());
    expect(deletedB.deletedAt?.getTime()).toBe(deletedList.deletedAt?.getTime());
  });

  it("leaves already soft-deleted tasks untouched, cascading only active tasks", async () => {
    const list = await createList({
      categoryId,
      name: `Cascade skip-deleted list ${Date.now()}`,
      sortOrder: undefined,
    });
    createdListIds.push(list.id);

    const originalDeletedAt = new Date("2020-01-01T00:00:00.000Z");
    const alreadyDeleted = await prisma.planningItem.create({
      data: {
        userId: DEV_USER_ID,
        listId: list.id,
        itemTypeId: defaultItemTypeId,
        statusId: defaultStatusId,
        title: `Already deleted task ${Date.now()}`,
        deletedAt: originalDeletedAt,
      },
    });
    const active = await prisma.planningItem.create({
      data: {
        userId: DEV_USER_ID,
        listId: list.id,
        itemTypeId: defaultItemTypeId,
        statusId: defaultStatusId,
        title: `Active task ${Date.now()}`,
      },
    });

    await softDeleteListWithTasks(list.id);

    const [untouched, cascaded] = await Promise.all([
      prisma.planningItem.findUniqueOrThrow({
        where: { id: alreadyDeleted.id },
      }),
      prisma.planningItem.findUniqueOrThrow({ where: { id: active.id } }),
    ]);

    // The pre-deleted task keeps its ORIGINAL timestamp — it is never
    // re-stamped, because only active tasks (deletedAt: null) are cascaded.
    expect(untouched.deletedAt?.getTime()).toBe(originalDeletedAt.getTime());
    // The active task is archived with a fresh timestamp.
    expect(cascaded.deletedAt).not.toBeNull();
    expect(cascaded.deletedAt?.getTime()).not.toBe(originalDeletedAt.getTime());
  });
});
