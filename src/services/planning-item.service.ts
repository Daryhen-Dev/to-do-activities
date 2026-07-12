import type { PlanningItem } from "@prisma/client";
import { getCurrentUserId } from "../lib/current-user";
import { NotFoundError } from "../lib/errors";
import {
  createPlanningItem,
  findDefaultStatusId,
  findItemTypeIdByKey,
  listPlanningItemsByUser,
} from "../repositories/planning-item.repository";
import type { CreatePlanningItemInput } from "../validators/planning-item.schema";

/**
 * ItemType has no `isDefault` flag (unlike Status), so when the request
 * omits `itemTypeId` we fall back to this seeded key. See
 * `src/prisma/seed.ts` for the ItemType rows.
 */
const DEFAULT_ITEM_TYPE_KEY = "tarea";

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

  const itemTypeId =
    input.itemTypeId ?? (await findItemTypeIdByKey(DEFAULT_ITEM_TYPE_KEY));
  if (!itemTypeId) {
    throw new NotFoundError(
      `Default item type "${DEFAULT_ITEM_TYPE_KEY}" is not seeded. Run the seed script before creating items.`,
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
