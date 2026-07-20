import { z } from "zod";

/**
 * POST /api/lists request body contract.
 *
 * A list always belongs to a category (`categoryId`). Ownership of that
 * category is verified server-side against `getCurrentUserId()` in the
 * service layer — the client cannot create a list under someone else's
 * category regardless of what it sends here.
 */
export const createListSchema = z.object({
  categoryId: z.string().min(1, "categoryId is required"),
  name: z
    .string()
    .trim()
    .min(1, "name is required")
    .max(100, "name must be at most 100 characters"),
  sortOrder: z.number().int().min(0).optional(),
});

export type CreateListInput = z.infer<typeof createListSchema>;

/**
 * PATCH /api/lists/[id] request body contract. Every field is optional —
 * only the fields present are updated. A list's parent category is NOT
 * reassignable here (moving lists between categories is intentionally out
 * of scope for this endpoint).
 */
export const updateListSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "name is required")
    .max(100, "name must be at most 100 characters")
    .optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export type UpdateListInput = z.infer<typeof updateListSchema>;
