import type { PlanningItem } from "@prisma/client";
import { getCurrentUserId } from "../lib/current-user";
import { NotFoundError, ValidationError } from "../lib/errors";
import {
  createPlanningItem,
  findDefaultItemTypeId,
  findDefaultStatusId,
  findOverlappingTimedItem,
  findOwnedPlanningItem,
  listDueReminders,
  listPlanningItemsByUser,
  listScheduledItemsByCategory,
  listScheduledItemsForUser,
  markReminderSeen,
  softDeletePlanningItem,
  updatePlanningItem,
} from "../repositories/planning-item.repository";
import type { ScheduledItemWithCategory } from "../lib/calendar";
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
 * Enforces the "no double-booking" rule: a TIMED (non-all-day) item may not
 * overlap another of the user's timed items, across all categories. All-day
 * items and unscheduled items are exempt. `excludeId` skips the item being
 * updated. Boundaries that merely touch do not conflict.
 */
async function assertNoTimedOverlap(
  userId: string,
  startAt: Date | null,
  endAt: Date | null,
  allDay: boolean,
  excludeId?: string,
): Promise<void> {
  if (!startAt || allDay) return;
  const conflict = await findOverlappingTimedItem(
    userId,
    startAt,
    endAt ?? startAt,
    excludeId,
  );
  if (conflict) {
    throw new ValidationError(
      "This activity overlaps another scheduled activity.",
    );
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
  await assertNoTimedOverlap(userId, startAt, endAt, input.allDay ?? false);

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
    remindAt: input.remindAt ?? null,
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
 * Scheduled items of the current user across ALL their categories overlapping
 * the `[from, to)` window — the data source for the combined multi-category
 * calendar. The acting user is resolved server-side (authoritative ownership),
 * so no per-category precheck is needed: the repository query is already scoped
 * to `userId`. Each item carries its owning category's id/name/color.
 */
export async function listScheduledItemsForCurrentUserRange(
  from: Date,
  to: Date,
): Promise<ScheduledItemWithCategory[]> {
  const userId = await getCurrentUserId();
  return listScheduledItemsForUser(userId, from, to);
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
 * The current user's due reminders (live, `remindAt <= now`, not yet
 * acknowledged), soonest-first — the data source for the notification bell. The
 * acting user is resolved server-side and "now" is the server clock, so the due
 * set is authoritative and cannot be spoofed by the client.
 */
export async function listDueRemindersForCurrentUser(): Promise<PlanningItem[]> {
  const userId = await getCurrentUserId();
  return listDueReminders(userId, new Date());
}

/**
 * Acknowledges (dismisses) an owned reminder by stamping `reminderSeenAt` with
 * the server clock, removing it from the due set. Ownership is prechecked here,
 * so an absent or foreign id yields `NotFoundError` (404) without leaking
 * existence — same pattern as get/update/delete.
 */
export async function acknowledgeReminderForCurrentUser(
  id: string,
): Promise<PlanningItem> {
  const userId = await getCurrentUserId();
  await getOwnedPlanningItemOrThrow(userId, id);
  return markReminderSeen(id, new Date());
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

  const effectiveAllDay =
    input.allDay !== undefined ? input.allDay : existing.allDay;
  await assertNoTimedOverlap(
    userId,
    effectiveStartAt,
    effectiveEndAt,
    effectiveAllDay,
    id,
  );

  // When clearing the start unschedules the item, persist the end clear even
  // if the payload did not mention `endAt`.
  const clearDanglingEnd =
    input.endAt === undefined &&
    effectiveStartAt === null &&
    existing.endAt !== null;

  // A reminder re-arms only when its instant differs from the stored one.
  // Compared by epoch millis so equal times (the dialog echoing the current
  // value on an unrelated save) are treated as "unchanged" and preserve the
  // prior acknowledgement.
  const remindAtChanged =
    input.remindAt !== undefined &&
    (input.remindAt?.getTime() ?? null) !==
      (existing.remindAt?.getTime() ?? null);

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
    // Forward `remindAt` when present, and re-arm ONLY when the time actually
    // CHANGES: dropping the prior acknowledgement so a rescheduled reminder can
    // fire again (and a cleared reminder has nothing left to acknowledge).
    // Keying on a real change (not merely on the key being present) is what
    // stops a previously dismissed reminder from resurfacing when the user saves
    // an unrelated edit — the dialog always echoes the current `remindAt` back.
    // `remindAt` is orthogonal to the schedule, so it never enters
    // validateSchedule/assertNoTimedOverlap.
    ...(input.remindAt !== undefined ? { remindAt: input.remindAt } : {}),
    ...(remindAtChanged ? { reminderSeenAt: null } : {}),
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
