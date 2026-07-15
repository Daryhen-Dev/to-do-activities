import { Prisma, type Category } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ConflictError, NotFoundError } from "../lib/errors";

/**
 * Sole Prisma import boundary for the category vertical slice. No other
 * layer (service, route) may import `src/lib/prisma` or run a Prisma query
 * directly.
 */

export interface CreateCategoryData {
  userId: string;
  name: string;
  color: string | null;
  icon: string | null;
  sortOrder: number | undefined;
}

export interface UpdateCategoryData {
  name?: string;
  color?: string | null;
  icon?: string | null;
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
 * Inserts a category. `name` uniqueness is enforced by a partial unique
 * index scoped to non-deleted rows (see the `categories_lists_soft_delete`
 * migration) — a duplicate ACTIVE name surfaces as Prisma error P2002,
 * translated here into the domain `ConflictError` so no Prisma error shape
 * leaks past this layer.
 */
export async function createCategory(
  data: CreateCategoryData,
): Promise<Category> {
  try {
    return await prisma.category.create({ data });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      throw new ConflictError(
        "A category with this name already exists.",
      );
    }
    throw error;
  }
}

/** Current user's non-deleted categories, ordered for display. */
export async function listActiveCategories(
  userId: string,
): Promise<Category[]> {
  return prisma.category.findMany({
    where: { userId, deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

/**
 * A single category owned by `userId`, or `null` if it does not exist, is
 * soft-deleted, or belongs to someone else. Callers (service layer) throw
 * `NotFoundError` on `null` — this never leaks existence via a different
 * status.
 */
export async function findOwnedCategory(
  userId: string,
  id: string,
): Promise<Category | null> {
  return prisma.category.findFirst({
    where: { id, userId, deletedAt: null },
  });
}

/**
 * Updates a category already confirmed owned by the caller (service layer
 * precheck). Duplicate ACTIVE name on update surfaces as P2002, translated
 * to `ConflictError`.
 */
export async function updateCategory(
  id: string,
  data: UpdateCategoryData,
): Promise<Category> {
  try {
    return await prisma.category.update({ where: { id }, data });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      throw new ConflictError(
        "A category with this name already exists.",
      );
    }
    throw error;
  }
}

/**
 * Archives a category (`deletedAt` set) AND cascades the archive to every
 * live list it owns, atomically. Runs the owned-precheck inside the same
 * interactive transaction so a not-found/not-owned category never partially
 * archives its lists.
 */
export async function deleteCategoryWithCascade(
  userId: string,
  id: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const category = await tx.category.findFirst({
      where: { id, userId, deletedAt: null },
      select: { id: true },
    });
    if (!category) {
      throw new NotFoundError("category not found");
    }

    const now = new Date();
    await tx.list.updateMany({
      where: { categoryId: id, deletedAt: null },
      data: { deletedAt: now },
    });
    await tx.category.update({ where: { id }, data: { deletedAt: now } });
  });
}
