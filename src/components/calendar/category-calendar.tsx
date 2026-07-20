"use client";

import type { PlanningItem } from "@prisma/client";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  buildMonthGrid,
  type CalendarEvent,
  groupEventsByDay,
  isSameDay,
  rangeFor,
  toCalendarEvents,
} from "@/lib/calendar";
import { useCalendarStore } from "@/stores/calendar-store";
import { DetailSheet } from "@/components/ui/detail-sheet";
import { AgendaList } from "./agenda-list";
import { CalendarToolbar } from "./calendar-toolbar";
import { MonthGrid } from "./month-grid";

/**
 * Container for a single category's calendar. Owns event data fetching for the
 * currently visible range (derived from the shared view/anchor store), fills
 * the available screen space, and opens a details Sheet when an event is peeked
 * (hover-hold or click) in the month view. Read-only — no mutations.
 */

interface CategoryCalendarProps {
  categoryId: string;
  categoryName: string;
}

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
};
const TIME_FORMAT: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
};

/** Human "when" line for the details Sheet (local date + time or all-day). */
function formatWhen(event: CalendarEvent): string {
  const date = event.startAt.toLocaleDateString(undefined, DATE_FORMAT);
  if (event.allDay) return `${date} · All day`;
  const start = event.startAt.toLocaleTimeString(undefined, TIME_FORMAT);
  if (!event.endAt) return `${date} · ${start}`;
  const end = event.endAt.toLocaleTimeString(undefined, TIME_FORMAT);
  if (isSameDay(event.startAt, event.endAt)) {
    return `${date} · ${start} – ${end}`;
  }
  const endDate = event.endAt.toLocaleDateString(undefined, DATE_FORMAT);
  return `${date} ${start} – ${endDate} ${end}`;
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
  const [peekEvent, setPeekEvent] = useState<CalendarEvent | null>(null);

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
    <div className="flex flex-1 flex-col gap-4">
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
        <div className="min-h-0 flex-1">
          <MonthGrid
            weeks={weeks}
            events={events}
            anchorMonth={anchorDate.getMonth()}
            onPeek={setPeekEvent}
          />
        </div>
      ) : (
        <AgendaList groups={groups} />
      )}

      <DetailSheet
        open={peekEvent !== null}
        onOpenChange={(open) => {
          if (!open) setPeekEvent(null);
        }}
        title={peekEvent?.title ?? ""}
        description={peekEvent ? formatWhen(peekEvent) : undefined}
      >
        {peekEvent?.description ? (
          <p className="text-sm whitespace-pre-wrap">{peekEvent.description}</p>
        ) : (
          <p className="text-sm text-muted-foreground">No description.</p>
        )}
      </DetailSheet>
    </div>
  );
}
