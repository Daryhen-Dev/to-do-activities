import { z } from "zod";

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
  });

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
  archived: z.boolean().optional(),
});

export type UpdatePlanningItemInput = z.infer<typeof updatePlanningItemSchema>;
