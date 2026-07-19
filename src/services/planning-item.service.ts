import type { PlanningItem } from "@prisma/client";
import { getCurrentUserId } from "../lib/current-user";
import { NotFoundError } from "../lib/errors";
import {
  createPlanningItem,
  findDefaultItemTypeId,
  findDefaultStatusId,
  findOwnedPlanningItem,
  listPlanningItemsByUser,
  softDeletePlanningItem,
  updatePlanningItem,
} from "../repositories/planning-item.repository";
import type {
  CreatePlanningItemInput,
  UpdatePlanningItemInput,
} from "../validators/planning-item.schema";

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
    dueAt: input.dueAt ?? null,
  });
}

/** Current user's non-deleted planning items. */
export async function listPlanningItemsForCurrentUser(): Promise<PlanningItem[]> {
  const userId = await getCurrentUserId();
  return listPlanningItemsByUser(userId);
}

/**
 * Fetches an item owned by the current user, or throws `NotFoundError`.
 * Shared by get/update/delete so the ownership precheck lives in one place
 * — same pattern as the category vertical's `getOwnedCategoryOrThrow`.
 */
async function getOwnedPlanningItemOrThrow(
  userId: string,
  id: string,
): Promise<PlanningItem> {
  const item = await findOwnedPlanningItem(userId, id);
  if (!item) {
    throw new NotFoundError("planning item not found");
  }
  return item;
}

/** A single owned item, or `NotFoundError` if not found/not owned. */
export async function getPlanningItemForCurrentUser(
  id: string,
): Promise<PlanningItem> {
  const userId = await getCurrentUserId();
  return getOwnedPlanningItemOrThrow(userId, id);
}

/**
 * Updates an owned item. Ownership is prechecked here; only the fields
 * present in `input` are forwarded to the repository, and an explicit
 * `null` on a nullable field is passed through to clear it (distinct from
 * omitting the key). Unknown FK references surface as `NotFoundError` from
 * the repository.
 */
export async function updatePlanningItemForCurrentUser(
  id: string,
  input: UpdatePlanningItemInput,
): Promise<PlanningItem> {
  const userId = await getCurrentUserId();
  await getOwnedPlanningItemOrThrow(userId, id);

  return updatePlanningItem(id, {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined
      ? { description: input.description }
      : {}),
    ...(input.listId !== undefined ? { listId: input.listId } : {}),
    ...(input.itemTypeId !== undefined ? { itemTypeId: input.itemTypeId } : {}),
    ...(input.priorityId !== undefined
      ? { priorityId: input.priorityId }
      : {}),
    ...(input.statusId !== undefined ? { statusId: input.statusId } : {}),
    ...(input.dueAt !== undefined ? { dueAt: input.dueAt } : {}),
    ...(input.archived !== undefined ? { archived: input.archived } : {}),
  });
}

/** Soft-deletes an owned item. Ownership is prechecked here. */
export async function deletePlanningItemForCurrentUser(
  id: string,
): Promise<void> {
  const userId = await getCurrentUserId();
  await getOwnedPlanningItemOrThrow(userId, id);
  await softDeletePlanningItem(id);
}
