import { create } from "zustand";
import type { CalendarView } from "@/lib/calendar";

/**
 * Calendar view state, shared so it persists while the user navigates within
 * the session (e.g. switching category calendars keeps the chosen month and
 * view). This store holds ONLY UI/view state — event data is fetched per
 * visible range by the calendar component, never stored here.
 */

interface CalendarState {
  view: CalendarView;
  /** Any date within the month currently shown. */
  anchorDate: Date;
  setView: (view: CalendarView) => void;
  goToPrevMonth: () => void;
  goToNextMonth: () => void;
  goToToday: () => void;
}

/** Shifts a date by `months`, anchored to the 1st to avoid day-overflow. */
function shiftMonth(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

export const useCalendarStore = create<CalendarState>((set) => ({
  view: "month",
  anchorDate: new Date(),

  setView: (view) => set({ view }),
  goToPrevMonth: () =>
    set((state) => ({ anchorDate: shiftMonth(state.anchorDate, -1) })),
  goToNextMonth: () =>
    set((state) => ({ anchorDate: shiftMonth(state.anchorDate, 1) })),
  goToToday: () => set({ anchorDate: new Date() }),
}));
