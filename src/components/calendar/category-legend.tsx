"use client";

import { Bell, Repeat } from "lucide-react";

import { resolveCategoryColor } from "@/lib/category-color";
import { cn } from "@/lib/utils";
import { useCalendarFilterStore } from "@/stores/calendar-filter-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

/**
 * Combined-calendar legend + filters. Lists the user's categories (color swatch
 * + name + on/off toggle) followed by a single "Reminders" toggle for the whole
 * reminder layer. Reads categories from the shared workspace store and
 * visibility from the calendar filter store; clicking a chip toggles that
 * category's events (or the reminder layer) across all views. A dimmed,
 * struck-out chip means it is hidden. The Reminders toggle always renders, even
 * when there are no categories.
 */
export function CategoryLegend() {
  const categories = useWorkspaceStore((state) => state.categories);
  const hiddenCategoryIds = useCalendarFilterStore(
    (state) => state.hiddenCategoryIds,
  );
  const toggle = useCalendarFilterStore((state) => state.toggle);
  const remindersHidden = useCalendarFilterStore(
    (state) => state.remindersHidden,
  );
  const toggleReminders = useCalendarFilterStore(
    (state) => state.toggleReminders,
  );
  const habitsHidden = useCalendarFilterStore((state) => state.habitsHidden);
  const toggleHabits = useCalendarFilterStore((state) => state.toggleHabits);

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

      <button
        type="button"
        aria-pressed={!remindersHidden}
        onClick={toggleReminders}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs transition-opacity focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          remindersHidden
            ? "text-muted-foreground line-through opacity-60"
            : "text-foreground hover:bg-accent",
        )}
      >
        <Bell aria-hidden className="size-3" />
        Reminders
      </button>

      <button
        type="button"
        aria-pressed={!habitsHidden}
        onClick={toggleHabits}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs transition-opacity focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          habitsHidden
            ? "text-muted-foreground line-through opacity-60"
            : "text-foreground hover:bg-accent",
        )}
      >
        <Repeat aria-hidden className="size-3" />
        Habits
      </button>
    </div>
  );
}
