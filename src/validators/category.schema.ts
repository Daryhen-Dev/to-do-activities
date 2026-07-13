import { z } from "zod";

/**
 * POST /api/categories request body contract.
 *
 * `userId` is intentionally NOT part of this schema — ownership is always
 * resolved server-side via `getCurrentUserId()`, never accepted from the
 * client payload.
 */
export const createCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "name is required")
    .max(100, "name must be at most 100 characters"),
  color: z.string().trim().min(1).optional(),
  icon: z.string().trim().min(1).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

/**
 * PATCH /api/categories/[id] request body contract. Every field is
 * optional — only the fields present in the payload are updated.
 */
export const updateCategorySchema = createCategorySchema.partial();

export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
