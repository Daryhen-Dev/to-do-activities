"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  buildMonthGrid,
  buildWeekDays,
  type CalendarEvent,
  filterHabitLayer,
  filterReminderLayer,
  filterVisibleEvents,
  groupEventsByDay,
  isSameDay,
  parseHabitMarkerId,
  rangeFor,
  type ScheduledItemWithCategory,
  toCombinedCalendarEvents,
  toHabitCalendarEvents,
  toReminderCalendarEvents,
  toReminderOccurrenceCalendarEvents,
} from "@/lib/calendar";
import type { HabitOccurrenceDTO } from "@/lib/habits";
import type { ReminderOccurrenceDTO } from "@/lib/reminders";
import { Button } from "@/components/ui/button";
import { rescheduleEvent } from "@/lib/calendar-reschedule";
import { useCalendarStore } from "@/stores/calendar-store";
import { useCalendarFilterStore } from "@/stores/calendar-filter-store";
import { useItemTypeStore } from "@/stores/item-type-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { DetailSheet } from "@/components/ui/detail-sheet";
import { ItemTypeBadge } from "@/components/tasks/item-type-badge";
import { AgendaList } from "./agenda-list";
import { CalendarToolbar } from "./calendar-toolbar";
import { CategoryLegend } from "./category-legend";
import { MonthGrid } from "./month-grid";
import { TimeGrid } from "./time-grid";

/**
 * Container for the combined multi-category calendar. Fetches the user's
 * scheduled events across ALL categories for the visible range (shared
 * view/anchor store), colors them per category, and filters them by the
 * per-category toggles. Timed events are draggable to reschedule (week/day),
 * reusing the shared reschedule helper and the cross-category no-overlap rule.
 */

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

export function CombinedCalendar() {
  const view = useCalendarStore((state) => state.view);
  const anchorDate = useCalendarStore((state) => state.anchorDate);
  const ensureLoaded = useWorkspaceStore((state) => state.ensureLoaded);
  const ensureItemTypesLoaded = useItemTypeStore((state) => state.ensureLoaded);
  const itemTypes = useItemTypeStore((state) => state.itemTypes);
  const hiddenCategoryIds = useCalendarFilterStore(
    (state) => state.hiddenCategoryIds,
  );
  const remindersHidden = useCalendarFilterStore(
    (state) => state.remindersHidden,
  );
  const habitsHidden = useCalendarFilterStore((state) => state.habitsHidden);

  const { from, to } = rangeFor(view, anchorDate);
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [peekEvent, setPeekEvent] = useState<CalendarEvent | null>(null);

  // Load the category tree so the legend has names/colors to render, and the
  // item-type catalog so the detail sheet can show the type badge.
  useEffect(() => {
    void ensureLoaded();
    void ensureItemTypesLoaded();
  }, [ensureLoaded, ensureItemTypesLoaded]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      try {
        const query = `from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`;
        // Fetch the scheduled events, the reminder layer, and the habit layer in
        // parallel, then merge them into one event array (each layer carries its
        // own `kind`).
        const [scheduledRes, remindersRes, habitsRes, reminderOccRes] =
          await Promise.all([
            fetch(`/api/calendar?${query}`),
            fetch(`/api/calendar/reminders?${query}`),
            fetch(`/api/calendar/habits?${query}`),
            fetch(`/api/calendar/reminder-occurrences?${query}`),
          ]);
        if (
          !scheduledRes.ok ||
          !remindersRes.ok ||
          !habitsRes.ok ||
          !reminderOccRes.ok
        ) {
          throw new Error("request failed");
        }
        const [scheduledRows, reminderRows, habitRows, reminderOccRows] =
          (await Promise.all([
            scheduledRes.json(),
            remindersRes.json(),
            habitsRes.json(),
            reminderOccRes.json(),
          ])) as [
            ScheduledItemWithCategory[],
            ScheduledItemWithCategory[],
            HabitOccurrenceDTO[],
            ReminderOccurrenceDTO[],
          ];
        if (!active) return;
        setEvents([
          ...toCombinedCalendarEvents(scheduledRows),
          ...toReminderCalendarEvents(reminderRows),
          ...toHabitCalendarEvents(habitRows),
          ...toReminderOccurrenceCalendarEvents(reminderOccRows),
        ]);
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
  }, [fromIso, toIso]);

  const weeks = useMemo(() => buildMonthGrid(anchorDate), [anchorDate]);
  const weekDays = useMemo(() => buildWeekDays(anchorDate), [anchorDate]);

  // Render events whose category is toggled on, then drop the reminder layer
  // when the Reminders toggle is off.
  const visibleEvents = useMemo(
    () =>
      filterHabitLayer(
        filterReminderLayer(
          filterVisibleEvents(events, hiddenCategoryIds),
          remindersHidden,
        ),
        habitsHidden,
      ),
    [events, hiddenCategoryIds, remindersHidden, habitsHidden],
  );

  const itemTypeById = useMemo(
    () => new Map(itemTypes.map((type) => [type.id, type])),
    [itemTypes],
  );
  const peekType =
    peekEvent?.itemTypeId != null
      ? itemTypeById.get(peekEvent.itemTypeId)
      : undefined;

  /**
   * Toggles a habit occurrence's completion straight from its calendar peek,
   * reusing `POST`/`DELETE /api/habits/[id]/completions`. Optimistically flips
   * the marker (and the open peek), reverting on failure. The habit id + date
   * are recovered from the marker id (`"{habitId}:{date}"`).
   */
  async function handleToggleHabitOccurrence(event: CalendarEvent) {
    const parsed = parseHabitMarkerId(event.id);
    if (!parsed) return;
    const nextDone = !event.completed;
    const snapshot = events;

    const flip = (completed: boolean) => {
      setEvents((prev) =>
        prev.map((e) => (e.id === event.id ? { ...e, completed } : e)),
      );
      setPeekEvent((prev) =>
        prev && prev.id === event.id ? { ...prev, completed } : prev,
      );
    };

    flip(nextDone);

    const res = await fetch(`/api/habits/${parsed.habitId}/completions`, {
      method: nextDone ? "POST" : "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date: parsed.date }),
    });
    if (!res.ok) {
      toast.error("Failed to update the habit");
      setEvents(snapshot);
      setPeekEvent((prev) =>
        prev && prev.id === event.id
          ? { ...prev, completed: event.completed }
          : prev,
      );
    }
  }

  /** Reschedules a dragged event via the shared optimistic-move helper. */
  function handleReschedule(
    event: CalendarEvent,
    newStartAt: Date,
    newEndAt: Date | null,
  ) {
    void rescheduleEvent(event, newStartAt, newEndAt, events, setEvents);
  }

  const groups = useMemo(
    () => groupEventsByDay(visibleEvents, new Date(fromIso)),
    [visibleEvents, fromIso],
  );

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Calendar</h1>
        {loading ? (
          <Loader2
            className="size-4 animate-spin text-muted-foreground"
            aria-label="Loading calendar"
          />
        ) : null}
      </div>

      <CalendarToolbar />
      <CategoryLegend />

      {view === "month" ? (
        <div className="min-h-0 flex-1">
          <MonthGrid
            weeks={weeks}
            events={visibleEvents}
            anchorMonth={anchorDate.getMonth()}
            onPeek={setPeekEvent}
          />
        </div>
      ) : view === "week" ? (
        <div className="min-h-0 flex-1">
          <TimeGrid
            days={weekDays}
            events={visibleEvents}
            onPeek={setPeekEvent}
            onReschedule={handleReschedule}
          />
        </div>
      ) : view === "day" ? (
        <div className="min-h-0 flex-1">
          <TimeGrid
            days={[anchorDate]}
            events={visibleEvents}
            onPeek={setPeekEvent}
            onReschedule={handleReschedule}
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
        <div className="grid gap-3">
          {peekType ? (
            <div className="text-xs text-muted-foreground">
              <ItemTypeBadge itemType={peekType} />
            </div>
          ) : null}
          {peekEvent?.kind === "habit" ? (
            <div className="grid gap-2">
              <p className="text-xs font-medium">
                {peekEvent.completed
                  ? "✓ Completed on this day"
                  : "Not completed on this day"}
              </p>
              <Button
                type="button"
                size="sm"
                variant={peekEvent.completed ? "outline" : "default"}
                onClick={() => handleToggleHabitOccurrence(peekEvent)}
                className="justify-self-start"
              >
                {peekEvent.completed ? "Mark not done" : "Mark done"}
              </Button>
            </div>
          ) : null}
          {peekEvent?.description ? (
            <p className="text-sm whitespace-pre-wrap">
              {peekEvent.description}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No description.</p>
          )}
        </div>
      </DetailSheet>
    </div>
  );
}
