import { create } from "zustand";

/**
 * Combined-calendar filter state: which categories are hidden. Tracks HIDDEN
 * ids (not visible ids) so the default is "everything on" and newly created
 * categories appear automatically without bookkeeping. Session-scoped
 * (in-memory), so toggles survive view/period navigation but reset on reload.
 * Holds ONLY UI state — event data is never stored here.
 */

interface CalendarFilterState {
  /** Category ids whose events are currently hidden. Empty → all visible. */
  hiddenCategoryIds: Set<string>;
  /** Flips a category's visibility (always sets a NEW Set for reactivity). */
  toggle: (categoryId: string) => void;
  /** True when the category's events are currently hidden. */
  isHidden: (categoryId: string) => boolean;
  /** Clears all hidden categories (show everything). */
  reset: () => void;
}

export const useCalendarFilterStore = create<CalendarFilterState>(
  (set, get) => ({
    hiddenCategoryIds: new Set<string>(),

    toggle: (categoryId) =>
      set((state) => {
        const next = new Set(state.hiddenCategoryIds);
        if (next.has(categoryId)) {
          next.delete(categoryId);
        } else {
          next.add(categoryId);
        }
        return { hiddenCategoryIds: next };
      }),

    isHidden: (categoryId) => get().hiddenCategoryIds.has(categoryId),

    reset: () => set({ hiddenCategoryIds: new Set<string>() }),
  }),
);
