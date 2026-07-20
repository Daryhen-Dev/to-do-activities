import { Prisma, type PlanningItem } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { NotFoundError } from "../lib/errors";

/**
 * Sole Prisma import boundary for the planning-item vertical slice. No
 * other layer (service, route) may import `src/lib/prisma` or run a Prisma
 * query directly.
 */

export interface CreatePlanningItemData {
  userId: string;
  title: string;
  description: string | null;
  listId: string;
  itemTypeId: string;
  priorityId: string | null;
  statusId: string;
  dueAt: Date | null;
}

/**
 * Partial patch for an existing item. Only the keys present are written;
 * nullable columns accept `null` to clear them (see the schema for the
 * "unset vs omit" contract). Required columns (`listId`, `itemTypeId`,
 * `statusId`) may be reassigned but never nulled.
 */
export interface UpdatePlanningItemData {
  title?: string;
  description?: string | null;
  listId?: string;
  itemTypeId?: string;
  priorityId?: string | null;
  statusId?: string;
  dueAt?: Date | null;
  archived?: boolean;
}

/**
 * Inserts a planning item. Postgres FK constraints reject unknown
 * listId/itemTypeId/priorityId/statusId references with Prisma error
 * P2003 (foreign key constraint failed) — translated here into the
 * domain `NotFoundError` so no Prisma error shape leaks past this layer.
 */
export async function createPlanningItem(
  data: CreatePlanningItemData,
): Promise<PlanningItem> {
  try {
    return await prisma.planningItem.create({ data });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      throw new NotFoundError(
        "One or more referenced ids (listId, itemTypeId, priorityId, statusId) do not exist.",
      );
    }
    throw error;
  }
}

/** Current user's non-deleted items, newest first. */
export async function listPlanningItemsByUser(
  userId: string,
): Promise<PlanningItem[]> {
  return prisma.planningItem.findMany({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * A single item owned by `userId`, or `null` if it does not exist, is
 * soft-deleted, or belongs to someone else. Callers (service layer) throw
 * `NotFoundError` on `null` so existence is never leaked via a different
 * status — same pattern as `findOwnedCategory`.
 */
export async function findOwnedPlanningItem(
  userId: string,
  id: string,
): Promise<PlanningItem | null> {
  return prisma.planningItem.findFirst({
    where: { id, userId, deletedAt: null },
  });
}

/**
 * Updates an item already confirmed owned by the caller (service-layer
 * precheck). Unknown listId/itemTypeId/priorityId/statusId references fail
 * the FK constraint with Prisma error P2003, translated here into the
 * domain `NotFoundError` — same boundary contract as `createPlanningItem`.
 */
export async function updatePlanningItem(
  id: string,
  data: UpdatePlanningItemData,
): Promise<PlanningItem> {
  try {
    return await prisma.planningItem.update({ where: { id }, data });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      throw new NotFoundError(
        "One or more referenced ids (listId, itemTypeId, priorityId, statusId) do not exist.",
      );
    }
    throw error;
  }
}

/**
 * Archives an item by setting `deletedAt`. Idempotent at the row level; the
 * service-layer ownership precheck guarantees the row is live and owned
 * before this runs.
 */
export async function softDeletePlanningItem(id: string): Promise<void> {
  await prisma.planningItem.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

/**
 * Id of the single Status row flagged `isDefault: true`, or null if unseeded.
 * A partial unique index (see the `single_default_partial_unique` migration)
 * guarantees at most one such row at the database level; `orderBy` here is a
 * belt-and-suspenders tie-break in case that invariant is ever bypassed.
 */
export async function findDefaultStatusId(): Promise<string | null> {
  const status = await prisma.status.findFirst({
    where: { isDefault: true },
    select: { id: true },
    orderBy: { sortOrder: "asc" },
  });
  return status?.id ?? null;
}

/**
 * Id of the single ItemType row flagged `isDefault: true`, or null if
 * unseeded. A partial unique index (see the `single_default_partial_unique`
 * migration) guarantees at most one such row at the database level;
 * `orderBy` here is a belt-and-suspenders tie-break in case that invariant
 * is ever bypassed.
 */
export async function findDefaultItemTypeId(): Promise<string | null> {
  const itemType = await prisma.itemType.findFirst({
    where: { isDefault: true },
    select: { id: true },
    orderBy: { sortOrder: "asc" },
  });
  return itemType?.id ?? null;
}
