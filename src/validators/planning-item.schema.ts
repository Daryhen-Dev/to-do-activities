import { z } from "zod";

/**
 * Recurrence field group (item type `habito`). Field-level validation only:
 * days are distinct ISO weekdays (1..7, at most 7), interval is an integer
 * 1..365, time-of-day is minutes-since-midnight (0..1439). The cross-field
 * "at least one weekday OR an interval" rule and the habit-specific title /
 * description length bounds are enforced in the service against the EFFECTIVE
 * (merged) rule, because they only apply when the item type resolves to
 * `habito` — which the schema cannot determine from `itemTypeId` alone.
 */
const recurrenceDaysField = z
  .array(z.number().int().min(1, "weekday must be 1..7").max(7, "weekday must be 1..7"))
  .max(7, "at most 7 weekdays")
  .refine((a) => new Set(a).size === a.length, "weekdays must be distinct");

const recurrenceIntervalField = z
  .number()
  .int("interval must be an integer")
  .min(1, "interval must be at least 1")
  .max(365, "interval must be at most 365");

const recurrenceTimeMinutesField = z
  .number()
  .int("time must be an integer number of minutes")
  .min(0, "time must be within 00:00..23:59")
  .max(1439, "time must be within 00:00..23:59");

/**
 * POST /api/habits/[id]/completions request body contract. The date is a
 * date-only "YYYY-MM-DD" string, coerced to a local-midnight `Date` in the
 * service.
 */
export const habitCompletionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
});

export type HabitCompletionInput = z.infer<typeof habitCompletionSchema>;

/**
 * POST /api/planning-items request body contract.
 *
 * `userId` is intentionally NOT part of this schema — ownership is always
 * resolved server-side via `getCurrentUserId()`, never accepted from the
 * client payload.
 */
export const createPlanningItemSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "title is required")
      .max(500, "title must be at most 500 characters"),
    description: z.string().trim().min(1).optional(),
    listId: z.string().min(1, "listId is required"),
    itemTypeId: z.string().min(1).optional(),
    priorityId: z.string().min(1).optional(),
    statusId: z.string().min(1).optional(),
    dueAt: z.coerce.date().optional(),
    startAt: z.coerce.date().optional(),
    endAt: z.coerce.date().optional(),
    allDay: z.boolean().optional(),
    // Reminder time. Independent of the schedule — not part of the schedule
    // consistency refines below. `reminderSeenAt` is intentionally NOT part of
    // this schema: acknowledgement happens only via the dedicated reminders
    // endpoint, never from a client-supplied payload.
    remindAt: z.coerce.date().optional(),
    // Objective fields (item type `objetivo`). A dedicated timeframe independent
    // of `startAt`/`endAt`, so objectives never touch the calendar or the
    // no-overlap rule. `progress` is a completion percentage (0–100).
    objectiveStartAt: z.coerce.date().optional(),
    objectiveEndAt: z.coerce.date().optional(),
    progress: z.number().int().min(0).max(100).optional(),
    // Recurrence rule (item type `habito`). Field-level validation here; the
    // "at least one weekday OR an interval" rule is enforced in the service
    // against the effective rule. An empty `recurrenceDays` means interval-only.
    recurrenceDays: recurrenceDaysField.optional(),
    recurrenceInterval: recurrenceIntervalField.optional(),
    recurrenceTimeMinutes: recurrenceTimeMinutesField.optional(),
    recurrenceAnchor: z.coerce.date().optional(),
  })
  // A schedule must be internally consistent: an end requires a start, and it
  // cannot precede the start. The service re-checks the EFFECTIVE schedule on
  // update (partial payloads); this fast-fails an inconsistent create body.
  .refine((data) => !(data.endAt && !data.startAt), {
    message: "endAt requires startAt",
    path: ["endAt"],
  })
  .refine((data) => !(data.startAt && data.endAt && data.endAt < data.startAt), {
    message: "endAt must be on or after startAt",
    path: ["endAt"],
  })
  // Objective timeframe: end on or after start when both are set. Independent of
  // the schedule refines above.
  .refine(
    (data) =>
      !(
        data.objectiveStartAt &&
        data.objectiveEndAt &&
        data.objectiveEndAt < data.objectiveStartAt
      ),
    {
      message: "objectiveEndAt must be on or after objectiveStartAt",
      path: ["objectiveEndAt"],
    },
  );

export type CreatePlanningItemInput = z.infer<typeof createPlanningItemSchema>;

/**
 * PATCH /api/planning-items/[id] request body contract.
 *
 * Every field is optional — only the fields present in the payload are
 * updated. The nullable columns (`description`, `priorityId`, `dueAt`,
 * `startAt`, `endAt`) additionally accept an explicit `null` so the client
 * can CLEAR them (e.g. remove a due date or unschedule an item); `null` on a
 * nullable field is a deliberate "unset", distinct from omitting the key.
 * `listId`, `itemTypeId` and `statusId` are required columns, so they may be
 * changed but never cleared.
 *
 * Schedule consistency (`endAt` requires `startAt`, `endAt >= startAt`) is NOT
 * checked here: a partial patch may omit `startAt` while it still exists on the
 * stored row, so the authoritative check runs in the service against the
 * EFFECTIVE (merged) schedule.
 */
export const updatePlanningItemSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "title is required")
    .max(500, "title must be at most 500 characters")
    .optional(),
  description: z.string().trim().min(1).nullable().optional(),
  listId: z.string().min(1).optional(),
  itemTypeId: z.string().min(1).optional(),
  priorityId: z.string().min(1).nullable().optional(),
  statusId: z.string().min(1).optional(),
  dueAt: z.coerce.date().nullable().optional(),
  startAt: z.coerce.date().nullable().optional(),
  endAt: z.coerce.date().nullable().optional(),
  allDay: z.boolean().optional(),
  // Nullable = clearable (follows the `dueAt` precedent). `reminderSeenAt` is
  // deliberately absent: it is server-stamped via the dedicated reminders
  // endpoint and never client-writable through this general update surface.
  remindAt: z.coerce.date().nullable().optional(),
  // Objective fields — nullable = clearable. The authoritative timeframe check
  // (`objectiveEndAt >= objectiveStartAt`) runs in the service against the
  // EFFECTIVE (merged) values.
  objectiveStartAt: z.coerce.date().nullable().optional(),
  objectiveEndAt: z.coerce.date().nullable().optional(),
  progress: z.number().int().min(0).max(100).nullable().optional(),
  // Recurrence rule — nullable = clearable. Clearing the weekday set is an
  // empty array; the effective-rule check runs in the service.
  recurrenceDays: recurrenceDaysField.optional(),
  recurrenceInterval: recurrenceIntervalField.nullable().optional(),
  recurrenceTimeMinutes: recurrenceTimeMinutesField.nullable().optional(),
  recurrenceAnchor: z.coerce.date().nullable().optional(),
  archived: z.boolean().optional(),
});

export type UpdatePlanningItemInput = z.infer<typeof updatePlanningItemSchema>;
