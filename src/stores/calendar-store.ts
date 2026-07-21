import { create } from "zustand";
import type { CalendarView } from "@/lib/calendar";

/**
 * Calendar view state, shared so it persists while the user navigates within
 * the session (e.g. switching category calendars keeps the chosen view and
 * period). This store holds ONLY UI/view state — event data is fetched per
 * visible range by the calendar component, never stored here.
 */

interface CalendarState {
  view: CalendarView;
  /** Any date within the period currently shown. */
  anchorDate: Date;
  setView: (view: CalendarView) => void;
  /** Moves to the previous period for the active view. */
  goToPrev: () => void;
  /** Moves to the next period for the active view. */
  goToNext: () => void;
  goToToday: () => void;
}

/**
 * Shifts the anchor by one period in `direction` (±1) for the given view:
 * month → ±1 month (normalized to the 1st), week/agenda → ±7 days, day → ±1
 * day. Day/week shifts preserve the weekday so week alignment stays stable.
 */
function shiftByView(
  date: Date,
  view: CalendarView,
  direction: 1 | -1,
): Date {
  if (view === "month") {
    return new Date(date.getFullYear(), date.getMonth() + direction, 1);
  }
  const days = view === "day" ? 1 : 7;
  const next = new Date(date);
  next.setDate(next.getDate() + direction * days);
  return next;
}

export const useCalendarStore = create<CalendarState>((set) => ({
  view: "month",
  anchorDate: new Date(),

  setView: (view) => set({ view }),
  goToPrev: () =>
    set((state) => ({
      anchorDate: shiftByView(state.anchorDate, state.view, -1),
    })),
  goToNext: () =>
    set((state) => ({
      anchorDate: shiftByView(state.anchorDate, state.view, 1),
    })),
  goToToday: () => set({ anchorDate: new Date() }),
}));
