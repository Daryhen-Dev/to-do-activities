import type { PlanningItem } from "@prisma/client";
import { getCurrentUserId } from "../lib/current-user";
import { NotFoundError, ValidationError } from "../lib/errors";
import {
  createPlanningItem,
  findDefaultItemTypeId,
  findDefaultStatusId,
  findOwnedPlanningItem,
  listPlanningItemsByUser,
  listScheduledItemsByCategory,
  softDeletePlanningItem,
  updatePlanningItem,
} from "../repositories/planning-item.repository";
import { findOwnedList } from "../repositories/list.repository";
import { findOwnedCategory } from "../repositories/category.repository";
import type {
  CreatePlanningItemInput,
  UpdatePlanningItemInput,
} from "../validators/planning-item.schema";

/**
 * Enforces schedule consistency: an `endAt` requires a `startAt`, and it may
 * not precede the start. Callers pass the EFFECTIVE schedule (for updates, the
 * stored row merged with the patch), so a partial PATCH that omits `startAt`
 * is still validated against the value already on the row.
 */
function validateSchedule(startAt: Date | null, endAt: Date | null): void {
  if (endAt && !startAt) {
    throw new ValidationError("endAt requires startAt");
  }
  if (startAt && endAt && endAt < startAt) {
    throw new ValidationError("endAt must be on or after startAt");
  }
}

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

  // Enforce the mandatory hierarchy: the task must land in a list the caller
  // owns. `findOwnedList` joins through the parent category, so a list that is
  // absent or owned by someone else returns `null` and yields a precise 404 —
  // consistent with the list vertical's ownership pattern.
  const ownedList = await findOwnedList(userId, input.listId);
  if (!ownedList) {
    throw new NotFoundError("list not found");
  }

  const startAt = input.startAt ?? null;
  const endAt = input.endAt ?? null;
  validateSchedule(startAt, endAt);

  return createPlanningItem({
    userId,
    title: input.title,
    description: input.description ?? null,
    listId: input.listId,
    itemTypeId,
    priorityId: input.priorityId ?? null,
    statusId,
    dueAt: input.dueAt ?? null,
    startAt,
    endAt,
    allDay: input.allDay ?? false,
  });
}

/** Current user's non-deleted planning items. */
export async function listPlanningItemsForCurrentUser(): Promise<PlanningItem[]> {
  const userId = await getCurrentUserId();
  return listPlanningItemsByUser(userId);
}

/**
 * Scheduled items of an owned category overlapping the `[from, to)` window —
 * the data source for the per-category calendar. Category ownership is
 * verified up front via `findOwnedCategory` so a category that is absent or
 * owned by someone else yields a precise `NotFoundError` (never leaking
 * existence), consistent with the list vertical's ownership pattern.
 */
export async function listScheduledItemsForCategory(
  categoryId: string,
  from: Date,
  to: Date,
): Promise<PlanningItem[]> {
  const userId = await getCurrentUserId();

  const category = await findOwnedCategory(userId, categoryId);
  if (!category) {
    throw new NotFoundError("category not found");
  }

  return listScheduledItemsByCategory(userId, categoryId, from, to);
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
  const existing = await getOwnedPlanningItemOrThrow(userId, id);

  // Validate the EFFECTIVE schedule: the stored row overlaid with the patch,
  // where an explicit `null` means "clear". Clearing the start unschedules the
  // item entirely, so a dangling `endAt` is forced to null too.
  const effectiveStartAt =
    input.startAt !== undefined ? input.startAt : existing.startAt;
  let effectiveEndAt =
    input.endAt !== undefined ? input.endAt : existing.endAt;
  if (effectiveStartAt === null) {
    effectiveEndAt = null;
  }
  validateSchedule(effectiveStartAt, effectiveEndAt);

  // When clearing the start unschedules the item, persist the end clear even
  // if the payload did not mention `endAt`.
  const clearDanglingEnd =
    input.endAt === undefined &&
    effectiveStartAt === null &&
    existing.endAt !== null;

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
    ...(input.startAt !== undefined ? { startAt: input.startAt } : {}),
    ...(input.endAt !== undefined
      ? { endAt: input.endAt }
      : clearDanglingEnd
        ? { endAt: null }
        : {}),
    ...(input.allDay !== undefined ? { allDay: input.allDay } : {}),
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
