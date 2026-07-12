import { z } from "zod";

/**
 * POST /api/planning-items request body contract.
 *
 * `userId` is intentionally NOT part of this schema — ownership is always
 * resolved server-side via `getCurrentUserId()`, never accepted from the
 * client payload.
 */
export const createPlanningItemSchema = z.object({
  title: z.string().trim().min(1, "title is required"),
  description: z.string().trim().min(1).optional(),
  listId: z.string().min(1).optional(),
  itemTypeId: z.string().min(1).optional(),
  priorityId: z.string().min(1).optional(),
  statusId: z.string().min(1).optional(),
});

export type CreatePlanningItemInput = z.infer<typeof createPlanningItemSchema>;
