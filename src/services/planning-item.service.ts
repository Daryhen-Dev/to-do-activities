import type { PlanningItem } from "@prisma/client";
import { getCurrentUserId } from "../lib/current-user";
import { NotFoundError } from "../lib/errors";
import {
  createPlanningItem,
  findDefaultItemTypeId,
  findDefaultStatusId,
  listPlanningItemsByUser,
} from "../repositories/planning-item.repository";
import type { CreatePlanningItemInput } from "../validators/planning-item.schema";

/**
 * Business rules for creating a planning item: resolves the acting user
 * server-side, defaults `statusId`/`itemTypeId` when omitted, and lets
 * unknown references surface as `NotFoundError` (thrown either here, while
 * resolving a default, or by the repository when an explicit reference
 * fails the FK constraint). Never imports Prisma directly — only the
 * repository.
 */
export async function createPlanningItemForCurrentUser(
  input: CreatePlanningItemInput,
): Promise<PlanningItem> {
  const userId = await getCurrentUserId();

  const statusId = input.statusId ?? (await findDefaultStatusId());
  if (!statusId) {
    throw new NotFoundError(
      "No default status is configured. Run the seed script before creating items.",
    );
  }

  const itemTypeId = input.itemTypeId ?? (await findDefaultItemTypeId());
  if (!itemTypeId) {
    throw new NotFoundError(
      "No default item type is configured. Run the seed script before creating items.",
    );
  }

  return createPlanningItem({
    userId,
    title: input.title,
    description: input.description ?? null,
    listId: input.listId ?? null,
    itemTypeId,
    priorityId: input.priorityId ?? null,
    statusId,
  });
}

/** Current user's non-deleted planning items. */
export async function listPlanningItemsForCurrentUser(): Promise<PlanningItem[]> {
  const userId = await getCurrentUserId();
  return listPlanningItemsByUser(userId);
}
