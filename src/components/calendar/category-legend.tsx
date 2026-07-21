"use client";

import { resolveCategoryColor } from "@/lib/category-color";
import { cn } from "@/lib/utils";
import { useCalendarFilterStore } from "@/stores/calendar-filter-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

/**
 * Combined-calendar legend + filter. Lists the user's categories, each as a
 * color swatch + name + on/off toggle. Reads categories from the shared
 * workspace store and visibility from the calendar filter store; clicking a
 * chip toggles that category's events across all views. A dimmed, struck-out
 * chip means the category is hidden.
 */
export function CategoryLegend() {
  const categories = useWorkspaceStore((state) => state.categories);
  const hiddenCategoryIds = useCalendarFilterStore(
    (state) => state.hiddenCategoryIds,
  );
  const toggle = useCalendarFilterStore((state) => state.toggle);

  if (categories.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {categories.map((category) => {
        const color = resolveCategoryColor(category.color, category.id);
        const hidden = hiddenCategoryIds.has(category.id);
        return (
          <button
            key={category.id}
            type="button"
            aria-pressed={!hidden}
            onClick={() => toggle(category.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs transition-opacity focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              hidden
                ? "text-muted-foreground line-through opacity-60"
                : "text-foreground hover:bg-accent",
            )}
          >
            <span
              aria-hidden
              style={{ backgroundColor: color }}
              className={cn("size-2.5 rounded-full", hidden && "opacity-50")}
            />
            {category.name}
          </button>
        );
      })}
    </div>
  );
}
