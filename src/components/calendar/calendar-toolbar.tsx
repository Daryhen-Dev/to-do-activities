"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { buildWeekDays, type CalendarView } from "@/lib/calendar";
import { useCalendarStore } from "@/stores/calendar-store";

/**
 * Read-only calendar toolbar: shows a view-appropriate period title, period
 * navigation (prev / Today / next), and the Month | Week | Day | Agenda toggle.
 * All state lives in `useCalendarStore` — this component only reads it and calls
 * the (view-aware) store actions.
 */

const VIEW_OPTIONS: { value: CalendarView; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "day", label: "Day" },
  { value: "agenda", label: "Agenda" },
];

/** The period title shown for the active view. */
function titleFor(view: CalendarView, anchor: Date): string {
  if (view === "day") {
    return anchor.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  if (view === "week") {
    const days = buildWeekDays(anchor);
    const first = days[0];
    const last = days[6];
    const start = first.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
    const end = last.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return `${start} – ${end}`;
  }
  // month and agenda both key off the anchor's month.
  return anchor.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export function CalendarToolbar() {
  const view = useCalendarStore((state) => state.view);
  const anchorDate = useCalendarStore((state) => state.anchorDate);
  const setView = useCalendarStore((state) => state.setView);
  const goToPrev = useCalendarStore((state) => state.goToPrev);
  const goToNext = useCalendarStore((state) => state.goToNext);
  const goToToday = useCalendarStore((state) => state.goToToday);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-medium">{titleFor(view, anchorDate)}</h2>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={goToPrev}
            aria-label="Previous period"
          >
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="sm" onClick={goToToday}>
            Today
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={goToNext}
            aria-label="Next period"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      <div
        role="group"
        aria-label="Calendar view"
        className="flex items-center gap-1 rounded-lg border border-border p-0.5"
      >
        {VIEW_OPTIONS.map((option) => (
          <Button
            key={option.value}
            variant={view === option.value ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={view === option.value}
            onClick={() => setView(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
