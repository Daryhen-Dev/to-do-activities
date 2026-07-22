"use client";

import { Bell, Check, Repeat } from "lucide-react";

import { type CalendarEvent, eventsOnDay, isSameDay } from "@/lib/calendar";
import { cn } from "@/lib/utils";

/**
 * Presentational month grid. Renders a weekday header row (Sun..Sat) and the
 * given `weeks`, placing up to `MAX_PER_DAY` event chips per day (with a
 * "+N more" overflow line). The grid fills the available height. Event chips
 * are read-only affordances: clicking (or keyboard-activating) one calls
 * `onPeek` to open its details.
 */

/** Max event chips rendered per day cell before collapsing into "+N more". */
const MAX_PER_DAY = 3;

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TIME_FORMAT: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
};

interface MonthGridProps {
  /** Week-aligned grid of days covering the anchor month (7 days per row). */
  weeks: Date[][];
  /** Events to place on their matching days. */
  events: CalendarEvent[];
  /** 0-based month of the anchor; days outside it are dimmed. */
  anchorMonth: number;
  /** Called when an event is peeked (hover-hold or click) to show its details. */
  onPeek?: (event: CalendarEvent) => void;
}

/** The chip label: local start time (or "All day") plus the event title. */
function chipLabel(event: CalendarEvent): string {
  if (event.allDay) return `All day · ${event.title}`;
  const time = event.startAt.toLocaleTimeString(undefined, TIME_FORMAT);
  return `${time} · ${event.title}`;
}

/**
 * A single event chip. Opens the details peek on click or keyboard activation
 * (also works on touch, where hover does not apply).
 */
function EventChip({
  event,
  onPeek,
}: {
  event: CalendarEvent;
  onPeek?: (event: CalendarEvent) => void;
}) {
  // In the combined view each event carries its category `color`, applied as an
  // accent (left border + light tint) so text contrast never depends on the
  // hue. Without a color (per-category view) the default chip styling is used.
  const colored = Boolean(event.color);
  // A reminder is a point marker: a dashed accent + a bell tell it apart from a
  // scheduled block at a glance.
  const isReminder = event.kind === "reminder";
  // A habit occurrence: a dotted accent + a repeat icon; a completed occurrence
  // is dimmed and struck through with a check.
  const isHabit = event.kind === "habit";
  const habitDone = isHabit && event.completed === true;
  return (
    <button
      type="button"
      title={chipLabel(event)}
      onClick={() => onPeek?.(event)}
      style={
        colored
          ? { borderLeftColor: event.color, backgroundColor: `${event.color}1a` }
          : undefined
      }
      className={cn(
        "flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        colored
          ? "border-l-[3px] text-foreground hover:opacity-80"
          : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        isReminder && "border-dashed",
        isHabit && "border-dotted",
        habitDone && "opacity-60 line-through",
      )}
    >
      {isReminder ? <Bell aria-hidden className="size-3 shrink-0" /> : null}
      {isHabit ? (
        habitDone ? (
          <Check aria-hidden className="size-3 shrink-0" />
        ) : (
          <Repeat aria-hidden className="size-3 shrink-0" />
        )
      ) : null}
      <span className="truncate">{chipLabel(event)}</span>
    </button>
  );
}

export function MonthGrid({
  weeks,
  events,
  anchorMonth,
  onPeek,
}: MonthGridProps) {
  const today = new Date();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border">
      <div className="grid grid-cols-7 border-b border-border bg-muted/50">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="px-2 py-1.5 text-center text-xs font-medium text-muted-foreground"
          >
            {label}
          </div>
        ))}
      </div>

      <div
        className="grid flex-1 grid-cols-7"
        style={{ gridAutoRows: "minmax(6rem, 1fr)" }}
      >
        {weeks.map((week) =>
          week.map((day) => {
            const inMonth = day.getMonth() === anchorMonth;
            const isToday = isSameDay(day, today);
            const dayEvents = eventsOnDay(events, day);
            const visible = dayEvents.slice(0, MAX_PER_DAY);
            const overflow = dayEvents.length - visible.length;

            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "flex min-h-0 flex-col border-b border-r border-border p-1.5 last:border-r-0",
                  !inMonth && "bg-muted/30 text-muted-foreground",
                )}
              >
                <div className="flex justify-end">
                  <span
                    className={cn(
                      "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs",
                      isToday &&
                        "bg-primary font-medium text-primary-foreground",
                    )}
                  >
                    {day.getDate()}
                  </span>
                </div>

                <div className="mt-1 grid min-h-0 gap-1 overflow-hidden">
                  {visible.map((event) => (
                    <EventChip key={event.id} event={event} onPeek={onPeek} />
                  ))}
                  {overflow > 0 ? (
                    <div className="px-1.5 text-xs text-muted-foreground">
                      +{overflow} more
                    </div>
                  ) : null}
                </div>
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}
