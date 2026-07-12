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
  listId: string | null;
  itemTypeId: string;
  priorityId: string | null;
  statusId: string;
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

/** Id of the single Status row flagged `isDefault: true`, or null if unseeded. */
export async function findDefaultStatusId(): Promise<string | null> {
  const status = await prisma.status.findFirst({
    where: { isDefault: true },
    select: { id: true },
  });
  return status?.id ?? null;
}

/** Id of the ItemType row matching `key`, or null if unseeded. */
export async function findItemTypeIdByKey(key: string): Promise<string | null> {
  const itemType = await prisma.itemType.findUnique({
    where: { key },
    select: { id: true },
  });
  return itemType?.id ?? null;
}
