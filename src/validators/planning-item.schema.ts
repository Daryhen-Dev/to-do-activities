import { z } from "zod";

/**
 * POST /api/planning-items request body contract.
 *
 * `userId` is intentionally NOT part of this schema — ownership is always
 * resolved server-side via `getCurrentUserId()`, never accepted from the
 * client payload.
 */
export const createPlanningItemSchema = z.object({
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
});

export type CreatePlanningItemInput = z.infer<typeof createPlanningItemSchema>;

/**
 * PATCH /api/planning-items/[id] request body contract.
 *
 * Every field is optional — only the fields present in the payload are
 * updated. The nullable columns (`description`, `priorityId`, `dueAt`)
 * additionally accept an explicit `null` so the client can CLEAR them
 * (e.g. remove a due date); `null` on a nullable field is a deliberate
 * "unset", distinct from omitting the key. `listId`, `itemTypeId` and
 * `statusId` are required columns, so they may be changed but never cleared.
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
  archived: z.boolean().optional(),
});

export type UpdatePlanningItemInput = z.infer<typeof updatePlanningItemSchema>;
