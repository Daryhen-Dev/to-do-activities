"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CalendarView } from "@/lib/calendar";
import { useCalendarStore } from "@/stores/calendar-store";

/**
 * Read-only calendar toolbar: shows the current month/year title, month
 * navigation (prev / Today / next), and the Month | Agenda view toggle. All
 * state lives in `useCalendarStore` — this component only reads it and calls
 * the store actions.
 */

const MONTH_TITLE_FORMAT: Intl.DateTimeFormatOptions = {
  month: "long",
  year: "numeric",
};

const VIEW_OPTIONS: { value: CalendarView; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "agenda", label: "Agenda" },
];

export function CalendarToolbar() {
  const view = useCalendarStore((state) => state.view);
  const anchorDate = useCalendarStore((state) => state.anchorDate);
  const setView = useCalendarStore((state) => state.setView);
  const goToPrevMonth = useCalendarStore((state) => state.goToPrevMonth);
  const goToNextMonth = useCalendarStore((state) => state.goToNextMonth);
  const goToToday = useCalendarStore((state) => state.goToToday);

  const title = anchorDate.toLocaleDateString(undefined, MONTH_TITLE_FORMAT);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-medium">{title}</h2>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={goToPrevMonth}
            aria-label="Previous month"
          >
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="sm" onClick={goToToday}>
            Today
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={goToNextMonth}
            aria-label="Next month"
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
