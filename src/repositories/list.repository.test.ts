import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEV_USER_ID } from "../lib/dev-user";
import { ConflictError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import {
  createList,
  findOwnedList,
  listActiveListsByCategory,
  listActiveListsByUser,
  softDeleteList,
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

  beforeAll(async () => {
    await prisma.category.findUniqueOrThrow({ where: { id: categoryId } });
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

    await softDeleteList(list.id);
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
    await softDeleteList(gone.id);

    const lists = await listActiveListsByUser(DEV_USER_ID);
    const ids = lists.map((item) => item.id);

    expect(ids).toContain(live.id);
    expect(ids).not.toContain(gone.id);
  });
});
