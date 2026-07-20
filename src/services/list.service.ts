import type { List } from "@prisma/client";
import { getCurrentUserId } from "../lib/current-user";
import { NotFoundError } from "../lib/errors";
import { findOwnedCategory } from "../repositories/category.repository";
import {
  createList,
  findOwnedList,
  listActiveListsByCategory,
  listActiveListsByUser,
  softDeleteListWithTasks,
  updateList,
} from "../repositories/list.repository";
import type {
  CreateListInput,
  UpdateListInput,
} from "../validators/list.schema";

/**
 * Business rules for the list vertical: resolves the acting user
 * server-side and enforces indirect ownership (list -> category -> user).
 * Orchestrates two repositories — the list boundary for list rows and the
 * category boundary to verify the parent category is owned before a list
 * is created or listed. Never imports Prisma directly.
 */

/**
 * Throws `NotFoundError` unless `categoryId` is a live category owned by
 * `userId`. Shared by create/list so the parent-ownership check lives in
 * one place — and never leaks existence via a different status.
 */
async function assertCategoryOwned(
  userId: string,
  categoryId: string,
): Promise<void> {
  const category = await findOwnedCategory(userId, categoryId);
  if (!category) {
    throw new NotFoundError("category not found");
  }
}

/**
 * Fetches a list owned (indirectly) by the current user, or throws
 * `NotFoundError`. Shared by get/update/delete so the ownership precheck
 * lives in one place.
 */
async function getOwnedListOrThrow(userId: string, id: string): Promise<List> {
  const list = await findOwnedList(userId, id);
  if (!list) {
    throw new NotFoundError("list not found");
  }
  return list;
}

export async function createListForCurrentUser(
  input: CreateListInput,
): Promise<List> {
  const userId = await getCurrentUserId();
  await assertCategoryOwned(userId, input.categoryId);

  return createList({
    categoryId: input.categoryId,
    name: input.name,
    sortOrder: input.sortOrder,
  });
}

/** Non-deleted lists in a category the current user owns. */
export async function listListsForCategory(
  categoryId: string,
): Promise<List[]> {
  const userId = await getCurrentUserId();
  await assertCategoryOwned(userId, categoryId);

  return listActiveListsByCategory(categoryId);
}

/** Every non-deleted list the current user owns, across all categories. */
export async function listAllListsForCurrentUser(): Promise<List[]> {
  const userId = await getCurrentUserId();
  return listActiveListsByUser(userId);
}

/** A single owned list, or `NotFoundError` if not found/not owned. */
export async function getListForCurrentUser(id: string): Promise<List> {
  const userId = await getCurrentUserId();
  return getOwnedListOrThrow(userId, id);
}

export async function updateListForCurrentUser(
  id: string,
  input: UpdateListInput,
): Promise<List> {
  const userId = await getCurrentUserId();
  await getOwnedListOrThrow(userId, id);

  return updateList(id, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
  });
}

/**
 * Soft-deletes an owned list and cascades the soft-delete to all of the
 * list's active tasks in a single atomic transaction. Ownership is
 * prechecked here; the cascade itself lives in `softDeleteListWithTasks`.
 */
export async function deleteListForCurrentUser(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  await getOwnedListOrThrow(userId, id);
  await softDeleteListWithTasks(id);
}
