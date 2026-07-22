import { Prisma, type PlanningItem } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { NotFoundError } from "../lib/errors";
import type { ScheduledItemWithCategory } from "../lib/calendar";
import type { NoteWithCategory } from "../lib/notes";
import type { ObjectiveWithCategory } from "../lib/objectives";
import type { HabitWithCompletions } from "../lib/habits";

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
  // Scheduling is optional at the data layer: omit to fall back to the column
  // defaults (start/end NULL, all_day false). The service passes explicit
  // values; direct callers/tests may omit them.
  startAt?: Date | null;
  endAt?: Date | null;
  allDay?: boolean;
  // Reminder time; omit to fall back to the column default (NULL). A freshly
  // created item is never pre-acknowledged, so `reminderSeenAt` starts NULL.
  remindAt?: Date | null;
  // Objective fields (item type `objetivo`); omit to fall back to NULL.
  objectiveStartAt?: Date | null;
  objectiveEndAt?: Date | null;
  progress?: number | null;
  // Recurrence fields (item type `habito`); omit to fall back to the column
  // defaults (`recurrenceDays` → empty array, the rest NULL). `recurrenceDays`
  // is a non-null scalar list, so an empty array means "no weekday selection".
  recurrenceDays?: number[];
  recurrenceTimeMinutes?: number | null;
  recurrenceInterval?: number | null;
  recurrenceAnchor?: Date | null;
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
  startAt?: Date | null;
  endAt?: Date | null;
  allDay?: boolean;
  remindAt?: Date | null;
  // Internal-only: set exclusively by the service (re-arm on a new `remindAt`,
  // clear when the reminder is removed). NEVER populated from the client update
  // schema — acknowledgement goes through `markReminderSeen` / the dedicated
  // reminders endpoint, not the general PATCH.
  reminderSeenAt?: Date | null;
  objectiveStartAt?: Date | null;
  objectiveEndAt?: Date | null;
  progress?: number | null;
  // Recurrence fields (item type `habito`). `recurrenceDays` is set to an empty
  // array to clear the weekday selection; the others accept `null` to clear.
  recurrenceDays?: number[];
  recurrenceTimeMinutes?: number | null;
  recurrenceInterval?: number | null;
  recurrenceAnchor?: Date | null;
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
 * The user's objectives (item type `objetivo`) that are live, each enriched with
 * its owning category — the data source for the Objectives view. Filters by the
 * item-type KEY (`objetivo`), joins `List → Category`, and flattens to
 * `ObjectiveWithCategory`. Ordered by deadline (`objectiveEndAt`) ascending with
 * no-deadline objectives LAST.
 */
export async function listObjectivesByUser(
  userId: string,
): Promise<ObjectiveWithCategory[]> {
  const rows = await prisma.planningItem.findMany({
    where: {
      userId,
      deletedAt: null,
      archived: false,
      itemType: { key: "objetivo" },
      list: {
        deletedAt: null,
        category: { userId, deletedAt: null },
      },
    },
    include: {
      list: {
        select: {
          category: { select: { id: true, name: true, color: true } },
        },
      },
    },
    orderBy: { objectiveEndAt: { sort: "asc", nulls: "last" } },
  });

  return rows.map(({ list, ...item }) => ({
    ...item,
    categoryId: list.category.id,
    categoryName: list.category.name,
    categoryColor: list.category.color,
  }));
}

/**
 * The user's DUE reminders at instant `now`: live items (`deletedAt` null, not
 * archived) that have a `remindAt` at or before `now` and have not been
 * acknowledged (`reminderSeenAt` null). Ordered soonest-first. This is the
 * authoritative "due" predicate — the client never recomputes it; it uses the
 * server's clock. Completion status is intentionally NOT part of the predicate,
 * keeping reminders decoupled from the Status catalog.
 */
export async function listDueReminders(
  userId: string,
  now: Date,
): Promise<PlanningItem[]> {
  return prisma.planningItem.findMany({
    where: {
      userId,
      deletedAt: null,
      archived: false,
      remindAt: { not: null, lte: now },
      reminderSeenAt: null,
    },
    orderBy: { remindAt: "asc" },
  });
}

/**
 * Stamps `reminderSeenAt` on an item, acknowledging its reminder. The
 * service-layer ownership precheck guarantees the row is live and owned before
 * this runs, so no ownership filter is needed here.
 */
export async function markReminderSeen(
  id: string,
  seenAt: Date,
): Promise<PlanningItem> {
  return prisma.planningItem.update({
    where: { id },
    data: { reminderSeenAt: seenAt },
  });
}

/**
 * Scheduled items in a category whose schedule overlaps the `[from, to)`
 * window, for the calendar. Only items with a `startAt` are returned
 * (unscheduled tasks and `dueAt`-only deadlines are excluded). Overlap is
 * `startAt < to AND coalesce(endAt, startAt) >= from`: a point item (no
 * `endAt`) is in-window when its start falls in the range; a ranged item
 * counts when it ends at/after `from` and starts before `to` — so multi-day
 * events crossing the window boundary are included. Ownership is enforced
 * indirectly through the parent list's category (`category: { userId }`),
 * matching the list vertical's owned-lookup pattern.
 */
export async function listScheduledItemsByCategory(
  userId: string,
  categoryId: string,
  from: Date,
  to: Date,
): Promise<PlanningItem[]> {
  return prisma.planningItem.findMany({
    where: {
      deletedAt: null,
      startAt: { not: null, lt: to },
      OR: [
        { endAt: null, startAt: { gte: from } },
        { endAt: { gte: from } },
      ],
      list: {
        categoryId,
        deletedAt: null,
        category: { userId, deletedAt: null },
      },
    },
    orderBy: [{ startAt: "asc" }, { createdAt: "asc" }],
  });
}

/**
 * Scheduled items of the WHOLE user (across all categories) whose schedule
 * overlaps the `[from, to)` window, each enriched with its owning category's
 * id/name/color — the data source for the combined multi-category calendar.
 * Same overlap predicate as `listScheduledItemsByCategory`
 * (`startAt < to AND coalesce(endAt, startAt) >= from`), but scoped by `userId`
 * instead of a single category. Joins `List → Category` and flattens to
 * `ScheduledItemWithCategory` so no Prisma relation shape leaks past this layer.
 */
export async function listScheduledItemsForUser(
  userId: string,
  from: Date,
  to: Date,
): Promise<ScheduledItemWithCategory[]> {
  const rows = await prisma.planningItem.findMany({
    where: {
      userId,
      deletedAt: null,
      startAt: { not: null, lt: to },
      OR: [
        { endAt: null, startAt: { gte: from } },
        { endAt: { gte: from } },
      ],
      list: {
        deletedAt: null,
        category: { userId, deletedAt: null },
      },
    },
    include: {
      list: {
        select: {
          category: { select: { id: true, name: true, color: true } },
        },
      },
    },
    orderBy: [{ startAt: "asc" }, { createdAt: "asc" }],
  });

  return rows.map(({ list, ...item }) => ({
    ...item,
    categoryId: list.category.id,
    categoryName: list.category.name,
    categoryColor: list.category.color,
  }));
}

/**
 * Reminders of the WHOLE user (across all categories) whose `remindAt` falls in
 * the `[from, to)` window, each enriched with its owning category's
 * id/name/color — the data source for the calendar's reminder layer. Unlike the
 * bell's `listDueReminders`, this does NOT filter by `reminderSeenAt` or
 * `remindAt <= now`: the calendar positions EVERY reminder in the period,
 * acknowledged or not. Excludes soft-deleted and archived items. Joins
 * `List → Category` and flattens to `ScheduledItemWithCategory` so no Prisma
 * relation shape leaks past this layer. Ordered `remindAt asc`.
 */
export async function listRemindersForUser(
  userId: string,
  from: Date,
  to: Date,
): Promise<ScheduledItemWithCategory[]> {
  const rows = await prisma.planningItem.findMany({
    where: {
      userId,
      deletedAt: null,
      archived: false,
      remindAt: { not: null, gte: from, lt: to },
      list: {
        deletedAt: null,
        category: { userId, deletedAt: null },
      },
    },
    include: {
      list: {
        select: {
          category: { select: { id: true, name: true, color: true } },
        },
      },
    },
    orderBy: [{ remindAt: "asc" }, { createdAt: "asc" }],
  });

  return rows.map(({ list, ...item }) => ({
    ...item,
    categoryId: list.category.id,
    categoryName: list.category.name,
    categoryColor: list.category.color,
  }));
}

/**
 * The user's notes (item type `nota`) that are live (not deleted, not archived),
 * each enriched with its owning category (the section) — the data source for the
 * Notes view. Filters by the item-type KEY (`nota`) rather than a hard-coded id,
 * joins `List → Category`, and flattens to `NoteWithCategory` so no Prisma
 * relation shape leaks past this layer. Ordered newest-first (`updatedAt desc`).
 */
export async function listNotesByUser(
  userId: string,
): Promise<NoteWithCategory[]> {
  const rows = await prisma.planningItem.findMany({
    where: {
      userId,
      deletedAt: null,
      archived: false,
      itemType: { key: "nota" },
      list: {
        deletedAt: null,
        category: { userId, deletedAt: null },
      },
    },
    include: {
      list: {
        select: {
          category: { select: { id: true, name: true, color: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return rows.map(({ list, ...item }) => ({
    ...item,
    categoryId: list.category.id,
    categoryName: list.category.name,
    categoryColor: list.category.color,
  }));
}

/**
 * The user's RECURRING reminders: live `recordatorio` items that carry a
 * recurrence rule (a non-empty `recurrenceDays` OR a non-null
 * `recurrenceInterval`), each enriched with its owning category. One-shot
 * reminders (no rule) are excluded — they keep flowing through `listDueReminders`
 * / `listRemindersForUser`. Joins `List → Category` and flattens to
 * `ScheduledItemWithCategory` so no Prisma relation shape leaks. This is the only
 * place recurring reminders are read for the bell + calendar layer.
 */
export async function listRecurringReminders(
  userId: string,
): Promise<ScheduledItemWithCategory[]> {
  const rows = await prisma.planningItem.findMany({
    where: {
      userId,
      deletedAt: null,
      archived: false,
      itemType: { key: "recordatorio" },
      OR: [
        { recurrenceDays: { isEmpty: false } },
        { recurrenceInterval: { not: null } },
      ],
      list: {
        deletedAt: null,
        category: { userId, deletedAt: null },
      },
    },
    include: {
      list: {
        select: {
          category: { select: { id: true, name: true, color: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return rows.map(({ list, ...item }) => ({
    ...item,
    categoryId: list.category.id,
    categoryName: list.category.name,
    categoryColor: list.category.color,
  }));
}

/**
 * The user's habits (item type `habito`) that are live (not deleted, not
 * archived), each enriched with its owning category (the section) and its
 * `HabitCompletion` rows — the data source for the Habits view and its adherence
 * computation. Filters by the item-type KEY (`habito`), joins `List → Category`,
 * and `include`s each item's completions (date only). Flattened to
 * `HabitWithCompletions` so no Prisma relation shape leaks past this layer. This
 * is the ONLY place `HabitCompletion` rows are read. Ordered by creation
 * (`createdAt asc`) for a stable list.
 */
export async function listHabitsByUser(
  userId: string,
): Promise<HabitWithCompletions[]> {
  const rows = await prisma.planningItem.findMany({
    where: {
      userId,
      deletedAt: null,
      archived: false,
      itemType: { key: "habito" },
      list: {
        deletedAt: null,
        category: { userId, deletedAt: null },
      },
    },
    include: {
      list: {
        select: {
          category: { select: { id: true, name: true, color: true } },
        },
      },
      habitCompletions: { select: { date: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return rows.map(({ list, habitCompletions, ...item }) => ({
    ...item,
    categoryId: list.category.id,
    categoryName: list.category.name,
    categoryColor: list.category.color,
    completions: habitCompletions,
  }));
}

/**
 * A single HABIT owned by `userId`, or `null` if it does not exist, is
 * soft-deleted, belongs to someone else, or is not a `habito`-type item.
 * Callers (service layer) throw `NotFoundError` on `null` so existence is never
 * leaked — same pattern as `findOwnedPlanningItem`, plus the item-type filter.
 */
export async function findOwnedHabit(
  userId: string,
  id: string,
): Promise<PlanningItem | null> {
  return prisma.planningItem.findFirst({
    where: { id, userId, deletedAt: null, itemType: { key: "habito" } },
  });
}

/**
 * Records a completion for one occurrence, keyed by `(planningItemId, date)`.
 * Idempotent: the unique `(planning_item_id, date)` index makes a duplicate
 * insert raise Prisma `P2002`, which is swallowed as success so a repeated
 * mark-complete leaves exactly one row. `date` must be a UTC-midnight `@db.Date`
 * value (see `toDbDate`). The service-layer ownership + schedule prechecks run
 * before this.
 */
export async function createHabitCompletion(
  userId: string,
  planningItemId: string,
  date: Date,
): Promise<void> {
  try {
    await prisma.habitCompletion.create({
      data: { userId, planningItemId, date },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return; // already completed — idempotent no-op
    }
    throw error;
  }
}

/**
 * Removes the completion for `(planningItemId, date)`. Idempotent: deleting zero
 * rows is success (a repeated mark-incomplete is a no-op). `date` must be a
 * UTC-midnight `@db.Date` value (see `toDbDate`).
 */
export async function deleteHabitCompletion(
  planningItemId: string,
  date: Date,
): Promise<void> {
  await prisma.habitCompletion.deleteMany({
    where: { planningItemId, date },
  });
}

/**
 * The first of the user's TIMED (non-all-day) scheduled items whose interval
 * overlaps `[start, end)` — it starts before `end` and ends after `start`, so
 * boundaries that merely touch (e.g. 10–11 and 11–12) do NOT count as a
 * conflict. `excludeId` skips the item being updated. Returns `null` when there
 * is no conflict. Scoped to the whole user (across all categories) to enforce
 * the "no double-booking" rule; all-day items are ignored.
 *
 * `end` is the caller's effective end (use `startAt` when the new item has no
 * `endAt`). An existing item's effective end is `endAt`, or its `startAt` when
 * `endAt` is null (a point-in-time item).
 */
export async function findOverlappingTimedItem(
  userId: string,
  start: Date,
  end: Date,
  excludeId?: string,
): Promise<PlanningItem | null> {
  return prisma.planningItem.findFirst({
    where: {
      userId,
      deletedAt: null,
      allDay: false,
      startAt: { not: null, lt: end },
      OR: [
        { endAt: { gt: start } },
        { endAt: null, startAt: { gt: start } },
      ],
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
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

/**
 * The `key` of an ItemType by its id, or `null` when the id is unknown. Used by
 * the service to decide whether an item is a `habito` (and therefore whether the
 * recurrence-rule validation applies) without leaking the Prisma model.
 */
export async function findItemTypeKeyById(id: string): Promise<string | null> {
  const itemType = await prisma.itemType.findUnique({
    where: { id },
    select: { key: true },
  });
  return itemType?.key ?? null;
}
