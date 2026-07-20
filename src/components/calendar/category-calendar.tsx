"use client";

import type { PlanningItem } from "@prisma/client";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  buildMonthGrid,
  type CalendarEvent,
  groupEventsByDay,
  rangeFor,
  toCalendarEvents,
} from "@/lib/calendar";
import { useCalendarStore } from "@/stores/calendar-store";
import { AgendaList } from "./agenda-list";
import { CalendarToolbar } from "./calendar-toolbar";
import { MonthGrid } from "./month-grid";

/**
 * Container for a single category's calendar. Owns event data fetching for the
 * currently visible range (derived from the shared view/anchor store), and
 * renders the toolbar plus either the month grid or the agenda list. Fetching
 * is range-driven: whenever the category or the `[from, to)` window changes,
 * it reloads. Read-only — no mutations.
 */

interface CategoryCalendarProps {
  categoryId: string;
  categoryName: string;
}

export function CategoryCalendar({
  categoryId,
  categoryName,
}: CategoryCalendarProps) {
  const view = useCalendarStore((state) => state.view);
  const anchorDate = useCalendarStore((state) => state.anchorDate);

  const { from, to } = rangeFor(view, anchorDate);
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/categories/${categoryId}/calendar?from=${encodeURIComponent(
            fromIso,
          )}&to=${encodeURIComponent(toIso)}`,
        );
        if (!res.ok) {
          throw new Error("request failed");
        }
        const rows = (await res.json()) as PlanningItem[];
        if (!active) return;
        setEvents(toCalendarEvents(rows));
      } catch {
        if (active) toast.error("Failed to load the calendar");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [categoryId, fromIso, toIso]);

  const weeks = useMemo(() => buildMonthGrid(anchorDate), [anchorDate]);
  const groups = useMemo(
    () => groupEventsByDay(events, new Date(fromIso)),
    [events, fromIso],
  );

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{categoryName}</h1>
        {loading ? (
          <Loader2
            className="size-4 animate-spin text-muted-foreground"
            aria-label="Loading calendar"
          />
        ) : null}
      </div>

      <CalendarToolbar />

      {view === "month" ? (
        <MonthGrid
          weeks={weeks}
          events={events}
          anchorMonth={anchorDate.getMonth()}
        />
      ) : (
        <AgendaList groups={groups} />
      )}
    </div>
  );
}
