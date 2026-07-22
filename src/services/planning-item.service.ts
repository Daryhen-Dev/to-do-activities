import type { PlanningItem } from "@prisma/client";
import { getCurrentUserId } from "../lib/current-user";
import { NotFoundError, ValidationError } from "../lib/errors";
import {
  createHabitCompletion,
  createPlanningItem,
  deleteHabitCompletion,
  findDefaultItemTypeId,
  findDefaultStatusId,
  findItemTypeKeyById,
  findOverlappingTimedItem,
  findOwnedHabit,
  findOwnedPlanningItem,
  listDueReminders,
  listHabitsByUser,
  listNotesByUser,
  listObjectivesByUser,
  listPlanningItemsByUser,
  listRemindersForUser,
  listScheduledItemsByCategory,
  listScheduledItemsForUser,
  markReminderSeen,
  softDeletePlanningItem,
  updatePlanningItem,
} from "../repositories/planning-item.repository";
import type { ScheduledItemWithCategory } from "../lib/calendar";
import type { NoteWithCategory } from "../lib/notes";
import type { ObjectiveWithCategory } from "../lib/objectives";
import {
  completedKeysFromRows,
  computeStreak,
  computeWeeklyAdherence,
  dateKey,
  generateOccurrences,
  type HabitOccurrenceDTO,
  type HabitWithAdherence,
  isScheduledOn,
  normalizeDate,
  normalizeDays,
  ruleFromItem,
  toDbDate,
} from "../lib/habits";
import { findOwnedList } from "../repositories/list.repository";
import { findOwnedCategory } from "../repositories/category.repository";
import type {
  CreatePlanningItemInput,
  UpdatePlanningItemInput,
} from "../validators/planning-item.schema";

/** Item-type key for habits; recurrence validation applies only to these. */
const HABIT_ITEM_TYPE_KEY = "habito";
/** Habit-specific title / description length bounds (Requirement 9.6). */
const HABIT_TITLE_MAX = 200;
const HABIT_DESCRIPTION_MAX = 2000;

/**
 * Enforces the recurrence rule for a habit: at least one weekday OR a valid
 * "every N days" interval must be present, field ranges hold (defensive — zod
 * already checks the transport edge, but a partial PATCH merges stored values),
 * and the habit-specific title / description length bounds are respected.
 * Callers pass the EFFECTIVE values (for updates, the stored row merged with the
 * patch), so an invalid rule is rejected before any write and the prior rule is
 * retained.
 */
function validateRecurrenceRule(rule: {
  days: number[];
  interval: number | null;
  timeMinutes: number | null;
  title: string;
  description: string | null;
}): void {
  const days = normalizeDays(rule.days);
  const hasInterval = rule.interval != null;

  if (days.length === 0 && !hasInterval) {
    throw new ValidationError(
      "A habit requires at least one weekday or a recurrence interval.",
    );
  }
  if (
    hasInterval &&
    (!Number.isInteger(rule.interval) ||
      (rule.interval as number) < 1 ||
      (rule.interval as number) > 365)
  ) {
    throw new ValidationError("recurrence interval must be an integer 1..365");
  }
  if (
    rule.timeMinutes != null &&
    (!Number.isInteger(rule.timeMinutes) ||
      rule.timeMinutes < 0 ||
      rule.timeMinutes > 1439)
  ) {
    throw new ValidationError(
      "recurrence time-of-day must be within 00:00..23:59",
    );
  }
  if (rule.title.length > HABIT_TITLE_MAX) {
    throw new ValidationError(
      `title must be at most ${HABIT_TITLE_MAX} characters`,
    );
  }
  if (rule.description && rule.description.length > HABIT_DESCRIPTION_MAX) {
    throw new ValidationError(
      `description must be at most ${HABIT_DESCRIPTION_MAX} characters`,
    );
  }
}

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
 * Enforces objective-timeframe consistency: when both are set, `objectiveEndAt`
 * may not precede `objectiveStartAt`. Callers pass the EFFECTIVE timeframe (for
 * updates, the stored row merged with the patch). Independent of the schedule
 * and the no-overlap rule — objective dates live in their own columns.
 */
function validateObjectiveTimeframe(
  start: Date | null,
  end: Date | null,
): void {
  if (start && end && end < start) {
    throw new ValidationError(
      "objectiveEndAt must be on or after objectiveStartAt",
    );
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

  validateObjectiveTimeframe(
    input.objectiveStartAt ?? null,
    input.objectiveEndAt ?? null,
  );

  // Habits validate their recurrence rule. A habit never derives `startAt` from
  // the rule, so it never enters the calendar or the no-overlap check above
  // (Requirement 1.8).
  const isHabit = (await findItemTypeKeyById(itemTypeId)) === HABIT_ITEM_TYPE_KEY;
  if (isHabit) {
    validateRecurrenceRule({
      days: input.recurrenceDays ?? [],
      interval: input.recurrenceInterval ?? null,
      timeMinutes: input.recurrenceTimeMinutes ?? null,
      title: input.title,
      description: input.description ?? null,
    });
  }

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
    objectiveStartAt: input.objectiveStartAt ?? null,
    objectiveEndAt: input.objectiveEndAt ?? null,
    progress: input.progress ?? null,
    recurrenceDays: input.recurrenceDays ?? [],
    recurrenceTimeMinutes: input.recurrenceTimeMinutes ?? null,
    recurrenceInterval: input.recurrenceInterval ?? null,
    recurrenceAnchor: input.recurrenceAnchor ?? null,
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
 * The current user's reminders whose `remindAt` falls in `[from, to)`, across
 * all categories — the data source for the calendar's reminder layer. Resolves
 * the acting user server-side (authoritative ownership); no category precheck is
 * needed since the query is already user-scoped. Unlike the bell, this includes
 * acknowledged reminders (the calendar positions every reminder in the window).
 */
export async function listRemindersForCurrentUserRange(
  from: Date,
  to: Date,
): Promise<ScheduledItemWithCategory[]> {
  const userId = await getCurrentUserId();
  return listRemindersForUser(userId, from, to);
}

/**
 * The current user's notes (item type `nota`), each enriched with its owning
 * category (the section) — the data source for the Notes view. Resolves the
 * acting user server-side (authoritative ownership). Note create/update/delete
 * reuse the generic planning-item service functions; only this read is
 * notes-specific.
 */
export async function listNotesForCurrentUser(): Promise<NoteWithCategory[]> {
  const userId = await getCurrentUserId();
  return listNotesByUser(userId);
}

/**
 * The current user's objectives (item type `objetivo`), each enriched with its
 * owning category, ordered by deadline — the data source for the Objectives
 * view. Resolves the acting user server-side. Create/update/delete reuse the
 * generic planning-item service functions; only this read is objective-specific.
 */
export async function listObjectivesForCurrentUser(): Promise<
  ObjectiveWithCategory[]
> {
  const userId = await getCurrentUserId();
  return listObjectivesByUser(userId);
}

/**
 * The current user's habits (item type `habito`), each enriched with its owning
 * category and its computed adherence — the data source for the Habits view.
 * Resolves the acting user server-side; `now` is injected (defaults to the
 * server clock) so streak/weekly and the scheduled/completed-today flags are
 * deterministic. Streak and weekly adherence are computed from the completion
 * set versus the schedule — never from `progress` (Requirements 5.7, 6.6).
 * Create/update/delete of the habit row reuse the generic planning-item service
 * functions; only this read is habit-specific.
 */
export async function listHabitsForCurrentUser(
  now: Date = new Date(),
): Promise<HabitWithAdherence[]> {
  const userId = await getCurrentUserId();
  const rows = await listHabitsByUser(userId);
  const todayKey = dateKey(normalizeDate(now));

  return rows.map(({ completions, ...item }) => {
    const rule = ruleFromItem(item);
    const completedKeys = completedKeysFromRows(completions);
    return {
      ...item,
      rule,
      streak: computeStreak(rule, completedKeys, now),
      weekly: computeWeeklyAdherence(rule, completedKeys, now),
      scheduledToday: isScheduledOn(rule, now),
      completedToday: completedKeys.has(todayKey),
    };
  });
}

/**
 * The current user's habit OCCURRENCES within `[from, to)`, expanded from each
 * habit's recurrence rule — the data source for the calendar's habit layer.
 * Resolves the acting user server-side; reuses `listHabitsByUser` (the sole
 * Prisma boundary, which includes each habit's completions) and the pure
 * `generateOccurrences`. Emits one flat DTO per `(habit, occurrence)` with the
 * calendar-date string, the habit's time-of-day (or null for all-day), the
 * owning category, and whether that occurrence is completed. No category
 * precheck — the query is already user-scoped (mirrors the reminders range).
 */
export async function listHabitOccurrencesForCurrentUserRange(
  from: Date,
  to: Date,
): Promise<HabitOccurrenceDTO[]> {
  const userId = await getCurrentUserId();
  const habits = await listHabitsByUser(userId);

  const occurrences: HabitOccurrenceDTO[] = [];
  for (const habit of habits) {
    const rule = ruleFromItem(habit);
    const completedKeys = completedKeysFromRows(habit.completions);
    for (const occurrence of generateOccurrences(rule, from, to)) {
      const key = dateKey(occurrence);
      occurrences.push({
        habitId: habit.id,
        title: habit.title,
        description: habit.description,
        itemTypeId: habit.itemTypeId,
        date: key,
        timeMinutes: habit.recurrenceTimeMinutes,
        categoryId: habit.categoryId,
        categoryName: habit.categoryName,
        categoryColor: habit.categoryColor,
        completed: completedKeys.has(key),
      });
    }
  }
  return occurrences;
}

/**
 * Marks (or unmarks) one occurrence of an owned habit complete for a normalized
 * date. Ownership is prechecked (`findOwnedHabit` → `NotFoundError` when absent,
 * foreign, or not a habit — Requirement 4.6); the date must be one the rule
 * actually schedules (`ValidationError` otherwise — Requirement 4.5). The
 * completion write is idempotent by construction (create swallows the unique
 * violation; delete of a missing row is a no-op — Requirements 4.1–4.4). The
 * date is parsed as a LOCAL calendar day (to match the schedule) and stored as a
 * UTC-midnight `@db.Date` (see `toDbDate`).
 */
export async function setHabitCompletionForCurrentUser(
  id: string,
  dateStr: string,
  done: boolean,
): Promise<void> {
  const userId = await getCurrentUserId();

  const habit = await findOwnedHabit(userId, id);
  if (!habit) {
    throw new NotFoundError("habit not found");
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) {
    throw new ValidationError("date must be YYYY-MM-DD");
  }
  const [, y, m, d] = match;
  const localDate = new Date(Number(y), Number(m) - 1, Number(d));

  const rule = ruleFromItem(habit);
  if (!isScheduledOn(rule, localDate)) {
    throw new ValidationError("date is not a scheduled occurrence of this habit");
  }

  const dbDate = toDbDate(localDate);
  if (done) {
    await createHabitCompletion(userId, id, dbDate);
  } else {
    await deleteHabitCompletion(id, dbDate);
  }
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

  // Validate the EFFECTIVE objective timeframe (stored overlaid with the patch,
  // `null` = clear). Independent of the schedule / no-overlap checks above.
  const effectiveObjectiveStartAt =
    input.objectiveStartAt !== undefined
      ? input.objectiveStartAt
      : existing.objectiveStartAt;
  const effectiveObjectiveEndAt =
    input.objectiveEndAt !== undefined
      ? input.objectiveEndAt
      : existing.objectiveEndAt;
  validateObjectiveTimeframe(effectiveObjectiveStartAt, effectiveObjectiveEndAt);

  // Validate the EFFECTIVE recurrence rule when the item is (or becomes) a
  // habit. The stored row is overlaid with the patch, so a partial PATCH is
  // validated against the persisted rule and an invalid rule leaves it
  // unchanged (Requirements 1.3, 1.5, 1.7).
  const effectiveItemTypeId =
    input.itemTypeId !== undefined ? input.itemTypeId : existing.itemTypeId;
  const isHabit =
    (await findItemTypeKeyById(effectiveItemTypeId)) === HABIT_ITEM_TYPE_KEY;
  if (isHabit) {
    validateRecurrenceRule({
      days:
        input.recurrenceDays !== undefined
          ? input.recurrenceDays
          : existing.recurrenceDays,
      interval:
        input.recurrenceInterval !== undefined
          ? input.recurrenceInterval
          : existing.recurrenceInterval,
      timeMinutes:
        input.recurrenceTimeMinutes !== undefined
          ? input.recurrenceTimeMinutes
          : existing.recurrenceTimeMinutes,
      title: input.title !== undefined ? input.title : existing.title,
      description:
        input.description !== undefined
          ? input.description
          : existing.description,
    });
  }

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
    ...(input.objectiveStartAt !== undefined
      ? { objectiveStartAt: input.objectiveStartAt }
      : {}),
    ...(input.objectiveEndAt !== undefined
      ? { objectiveEndAt: input.objectiveEndAt }
      : {}),
    ...(input.progress !== undefined ? { progress: input.progress } : {}),
    ...(input.recurrenceDays !== undefined
      ? { recurrenceDays: input.recurrenceDays }
      : {}),
    ...(input.recurrenceTimeMinutes !== undefined
      ? { recurrenceTimeMinutes: input.recurrenceTimeMinutes }
      : {}),
    ...(input.recurrenceInterval !== undefined
      ? { recurrenceInterval: input.recurrenceInterval }
      : {}),
    ...(input.recurrenceAnchor !== undefined
      ? { recurrenceAnchor: input.recurrenceAnchor }
      : {}),
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
