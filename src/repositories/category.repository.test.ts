import { afterAll, describe, expect, it } from "vitest";
import { DEV_USER_ID } from "../lib/dev-user";
import { ConflictError, NotFoundError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import {
  createCategory,
  deleteCategoryWithCascade,
  findOwnedCategory,
  listActiveCategories,
  updateCategory,
} from "./category.repository";

/**
 * Integration tests against the real, seeded Postgres instance (see
 * `docker-compose.yml` / `pnpm db:seed`). Exercises the sole Prisma
 * boundary for the category slice — every row this suite creates is
 * removed in `afterAll` so reruns stay green.
 */
describe("category repository (integration)", () => {
  const createdCategoryIds: string[] = [];
  let otherUserId: string | null = null;

  afterAll(async () => {
    if (createdCategoryIds.length > 0) {
      await prisma.list.deleteMany({
        where: { categoryId: { in: createdCategoryIds } },
      });
      await prisma.category.deleteMany({
        where: { id: { in: createdCategoryIds } },
      });
    }
    if (otherUserId) {
      // Cascades and removes any categories/lists owned by this throwaway user.
      await prisma.user.delete({ where: { id: otherUserId } });
    }
  });

  it("persists a category owned by the given user", async () => {
    const category = await createCategory({
      userId: DEV_USER_ID,
      name: `Integration test: persists category ${Date.now()}`,
      color: null,
      icon: null,
      sortOrder: undefined,
    });
    createdCategoryIds.push(category.id);

    expect(category.id).toBeDefined();
    expect(category.userId).toBe(DEV_USER_ID);
    expect(category.deletedAt).toBeNull();
  });

  it("rejects a duplicate ACTIVE name for the same user with a ConflictError", async () => {
    const name = `Integration test: duplicate name ${Date.now()}`;
    const original = await createCategory({
      userId: DEV_USER_ID,
      name,
      color: null,
      icon: null,
      sortOrder: undefined,
    });
    createdCategoryIds.push(original.id);

    await expect(
      createCategory({
        userId: DEV_USER_ID,
        name,
        color: null,
        icon: null,
        sortOrder: undefined,
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("allows reusing a name once the original category is soft-deleted (partial index proof)", async () => {
    const name = `Integration test: reuse after archive ${Date.now()}`;
    const archived = await createCategory({
      userId: DEV_USER_ID,
      name,
      color: null,
      icon: null,
      sortOrder: undefined,
    });
    createdCategoryIds.push(archived.id);
    await prisma.category.update({
      where: { id: archived.id },
      data: { deletedAt: new Date() },
    });

    const recreated = await createCategory({
      userId: DEV_USER_ID,
      name,
      color: null,
      icon: null,
      sortOrder: undefined,
    });
    createdCategoryIds.push(recreated.id);

    expect(recreated.id).not.toBe(archived.id);
    expect(recreated.deletedAt).toBeNull();
  });

  it("excludes soft-deleted categories from the active list", async () => {
    const visible = await createCategory({
      userId: DEV_USER_ID,
      name: `Integration test: visible category ${Date.now()}`,
      color: null,
      icon: null,
      sortOrder: undefined,
    });
    createdCategoryIds.push(visible.id);

    const softDeleted = await createCategory({
      userId: DEV_USER_ID,
      name: `Integration test: soft-deleted category ${Date.now()}`,
      color: null,
      icon: null,
      sortOrder: undefined,
    });
    createdCategoryIds.push(softDeleted.id);
    await prisma.category.update({
      where: { id: softDeleted.id },
      data: { deletedAt: new Date() },
    });

    const categories = await listActiveCategories(DEV_USER_ID);
    const ids = categories.map((category) => category.id);

    expect(ids).toContain(visible.id);
    expect(ids).not.toContain(softDeleted.id);
  });

  it("scopes findOwnedCategory to the requested user only (cross-user isolation)", async () => {
    const otherUser = await prisma.user.create({
      data: { email: `other-user-${Date.now()}@test.local` },
    });
    otherUserId = otherUser.id;

    const othersCategory = await prisma.category.create({
      data: {
        userId: otherUser.id,
        name: `Integration test: other user's category ${Date.now()}`,
      },
    });

    const result = await findOwnedCategory(DEV_USER_ID, othersCategory.id);

    expect(result).toBeNull();
  });

  it("updates sortOrder on an owned category", async () => {
    const category = await createCategory({
      userId: DEV_USER_ID,
      name: `Integration test: update sortOrder ${Date.now()}`,
      color: null,
      icon: null,
      sortOrder: undefined,
    });
    createdCategoryIds.push(category.id);

    const updated = await updateCategory(category.id, { sortOrder: 5 });

    expect(updated.sortOrder).toBe(5);
  });

  it("cascades the archive to every live list when a category is deleted", async () => {
    const category = await createCategory({
      userId: DEV_USER_ID,
      name: `Integration test: cascade archive ${Date.now()}`,
      color: null,
      icon: null,
      sortOrder: undefined,
    });
    createdCategoryIds.push(category.id);

    const [listA, listB] = await Promise.all([
      prisma.list.create({
        data: { categoryId: category.id, name: "List A" },
      }),
      prisma.list.create({
        data: { categoryId: category.id, name: "List B" },
      }),
    ]);

    await deleteCategoryWithCascade(DEV_USER_ID, category.id);

    const [reloadedCategory, reloadedListA, reloadedListB] = await Promise.all(
      [
        prisma.category.findUniqueOrThrow({ where: { id: category.id } }),
        prisma.list.findUniqueOrThrow({ where: { id: listA.id } }),
        prisma.list.findUniqueOrThrow({ where: { id: listB.id } }),
      ],
    );

    expect(reloadedCategory.deletedAt).not.toBeNull();
    expect(reloadedListA.deletedAt).not.toBeNull();
    expect(reloadedListB.deletedAt).not.toBeNull();
  });

  it("throws NotFoundError when deleting a category not owned by the given user", async () => {
    const otherUser = otherUserId
      ? { id: otherUserId }
      : await prisma.user.create({
          data: { email: `other-user-delete-${Date.now()}@test.local` },
        });
    otherUserId = otherUser.id;

    const othersCategory = await prisma.category.create({
      data: {
        userId: otherUser.id,
        name: `Integration test: not-owned delete ${Date.now()}`,
      },
    });

    await expect(
      deleteCategoryWithCascade(DEV_USER_ID, othersCategory.id),
    ).rejects.toThrow(NotFoundError);
  });
});
