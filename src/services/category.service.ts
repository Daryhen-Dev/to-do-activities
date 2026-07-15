import type { Category } from "@prisma/client";
import { getCurrentUserId } from "../lib/current-user";
import { NotFoundError } from "../lib/errors";
import {
  createCategory,
  deleteCategoryWithCascade,
  findOwnedCategory,
  listActiveCategories,
  updateCategory,
} from "../repositories/category.repository";
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
} from "../validators/category.schema";

/**
 * Business rules for the category vertical: resolves the acting user
 * server-side and never imports Prisma directly — only the repository.
 */

/**
 * Fetches a category owned by the current user, or throws `NotFoundError`.
 * Shared by get/update/delete so the ownership precheck lives in one place.
 */
async function getOwnedCategoryOrThrow(
  userId: string,
  id: string,
): Promise<Category> {
  const category = await findOwnedCategory(userId, id);
  if (!category) {
    throw new NotFoundError("category not found");
  }
  return category;
}

export async function createCategoryForCurrentUser(
  input: CreateCategoryInput,
): Promise<Category> {
  const userId = await getCurrentUserId();

  return createCategory({
    userId,
    name: input.name,
    color: input.color ?? null,
    icon: input.icon ?? null,
    sortOrder: input.sortOrder,
  });
}

/** Current user's non-deleted categories. */
export async function listCategoriesForCurrentUser(): Promise<Category[]> {
  const userId = await getCurrentUserId();
  return listActiveCategories(userId);
}

/** A single owned category, or `NotFoundError` if not found/not owned. */
export async function getCategoryForCurrentUser(id: string): Promise<Category> {
  const userId = await getCurrentUserId();
  return getOwnedCategoryOrThrow(userId, id);
}

export async function updateCategoryForCurrentUser(
  id: string,
  input: UpdateCategoryInput,
): Promise<Category> {
  const userId = await getCurrentUserId();
  await getOwnedCategoryOrThrow(userId, id);

  return updateCategory(id, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.color !== undefined ? { color: input.color } : {}),
    ...(input.icon !== undefined ? { icon: input.icon } : {}),
    ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
  });
}

/**
 * Archives the category and cascades the archive to its lists. Ownership is
 * (re-)checked inside the repository's transaction — see
 * `deleteCategoryWithCascade`.
 */
export async function deleteCategoryForCurrentUser(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  await deleteCategoryWithCascade(userId, id);
}
