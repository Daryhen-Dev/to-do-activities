import { Prisma, type List } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ConflictError } from "../lib/errors";

/**
 * Sole Prisma import boundary for the list vertical slice. No other layer
 * (service, route) may import `src/lib/prisma` or run a Prisma query
 * directly.
 *
 * Ownership of a list is indirect — a list belongs to a category, which
 * belongs to a user. The owned-lookup here joins through the parent
 * category (`category: { userId, deletedAt: null }`) so a list is only
 * visible when its live category is owned by the caller. The service layer
 * additionally verifies category ownership before a create.
 */

export interface CreateListData {
  categoryId: string;
  name: string;
  sortOrder: number | undefined;
}

export interface UpdateListData {
  name?: string;
  sortOrder?: number;
}

/** True when the error is a Prisma unique-constraint violation (P2002). */
function isUniqueConstraintViolation(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/**
 * Inserts a list. `name` uniqueness is scoped per-category to non-deleted
 * rows by a partial unique index (see the `categories_lists_soft_delete`
 * migration) — a duplicate ACTIVE name in the same category surfaces as
 * Prisma error P2002, translated here into the domain `ConflictError`.
 */
export async function createList(data: CreateListData): Promise<List> {
  try {
    return await prisma.list.create({ data });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      throw new ConflictError(
        "A list with this name already exists in this category.",
      );
    }
    throw error;
  }
}

/** Non-deleted lists in a category, ordered for display. */
export async function listActiveListsByCategory(
  categoryId: string,
): Promise<List[]> {
  return prisma.list.findMany({
    where: { categoryId, deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

/**
 * Every non-deleted list the user owns, across all of their live categories
 * (joined through `category: { userId, deletedAt: null }`). Grouped by
 * category then display order so callers can render category-grouped pickers.
 */
export async function listActiveListsByUser(userId: string): Promise<List[]> {
  return prisma.list.findMany({
    where: {
      deletedAt: null,
      category: { userId, deletedAt: null },
    },
    orderBy: [
      { categoryId: "asc" },
      { sortOrder: "asc" },
      { createdAt: "asc" },
    ],
  });
}

/**
 * A single live list whose live parent category is owned by `userId`, or
 * `null` if it does not exist, is soft-deleted, sits under a soft-deleted
 * category, or belongs to someone else. Callers (service layer) throw
 * `NotFoundError` on `null` so existence is never leaked via a different
 * status.
 */
export async function findOwnedList(
  userId: string,
  id: string,
): Promise<List | null> {
  return prisma.list.findFirst({
    where: {
      id,
      deletedAt: null,
      category: { userId, deletedAt: null },
    },
  });
}

/**
 * Updates a list already confirmed owned by the caller (service-layer
 * precheck). Duplicate ACTIVE name in the category surfaces as P2002,
 * translated to `ConflictError`.
 */
export async function updateList(
  id: string,
  data: UpdateListData,
): Promise<List> {
  try {
    return await prisma.list.update({ where: { id }, data });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      throw new ConflictError(
        "A list with this name already exists in this category.",
      );
    }
    throw error;
  }
}

/**
 * Archives a list AND all of its active tasks in a single transaction.
 *
 * Lists and tasks are archived via `deletedAt` (soft-delete), not physically
 * removed. The database `ON DELETE CASCADE` FK on `planning_items.listId`
 * only fires on a hard `DELETE`, so it does NOT propagate a soft-delete.
 * The cascade required when a list is soft-deleted must therefore be done in
 * application code here.
 *
 * Both writes run inside `prisma.$transaction` so the operation is atomic:
 * either the list and every one of its active tasks are archived together, or
 * nothing changes (Requirement 2.4 — no partial delete). A single `now`
 * timestamp is shared so the list and its tasks carry identical `deletedAt`
 * values.
 *
 * The service-layer ownership precheck guarantees the row is live and owned
 * before this runs.
 */
export async function softDeleteListWithTasks(id: string): Promise<void> {
  const now = new Date();
  await prisma.$transaction([
    prisma.planningItem.updateMany({
      where: { listId: id, deletedAt: null },
      data: { deletedAt: now },
    }),
    prisma.list.update({ where: { id }, data: { deletedAt: now } }),
  ]);
}
