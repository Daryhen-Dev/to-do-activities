/**
 * Category color resolution for the combined calendar. Pure and deterministic
 * so the same category always renders with the same color, even when it has no
 * explicit `color` set. Kept free of React for unit testing.
 */

/**
 * Fixed palette used to derive colors for categories with no explicit `color`.
 * Mid-tone, visually distinct hues; applied as an accent (border/tint) so text
 * contrast never depends on the chosen hue.
 */
export const CATEGORY_COLOR_PALETTE = [
  "#3B82F6", // blue
  "#22C55E", // green
  "#F59E0B", // amber
  "#EF4444", // red
  "#A855F7", // purple
  "#EC4899", // pink
  "#14B8A6", // teal
  "#F97316", // orange
  "#6366F1", // indigo
  "#84CC16", // lime
] as const;

/**
 * Deterministic 32-bit string hash (djb2). Same input always yields the same
 * non-negative number, so palette selection is stable across reloads.
 */
function hashString(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  // Coerce to an unsigned 32-bit integer.
  return hash >>> 0;
}

/**
 * The color used to render a category's events. Returns `color` when it is a
 * non-empty string; otherwise derives a STABLE palette color from `categoryId`
 * (same id → same color across reloads). Pure — no randomness.
 */
export function resolveCategoryColor(
  color: string | null,
  categoryId: string,
): string {
  if (color && color.trim() !== "") {
    return color;
  }
  const index = hashString(categoryId) % CATEGORY_COLOR_PALETTE.length;
  return CATEGORY_COLOR_PALETTE[index];
}
