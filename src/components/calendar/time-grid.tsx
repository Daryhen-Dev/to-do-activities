"use client";

import { useEffect, useRef, useState } from "react";

import {
  type CalendarEvent,
  type PositionedEvent,
  layoutDayEvents,
  MINUTES_PER_DAY,
  isSameDay,
} from "@/lib/calendar";
import { cn } from "@/lib/utils";

/**
 * Presentational week/day time grid. Renders a header row (one column per day),
 * an all-day strip, and a scrollable hour body where timed events are placed by
 * their layout position. A live "now" indicator marks the current time on
 * today's column. Read-only: the only interaction is `onPeek` when an event is
 * clicked. Works with 1 day (day view) or 7 days (week view), and renders the
 * grid even when there are no events.
 */

/** Pixel height of a single hour row; the body is `24 * HOUR_HEIGHT` tall. */
const HOUR_HEIGHT = 48;

/** Number of hours (rows) in a day. */
const HOURS_IN_DAY = 24;

/** Left gutter width (hour axis / all-day label), aligned across all rows. */
const GUTTER_WIDTH = 64;

/** Minute at which the body auto-scrolls into view on mount (~07:00). */
const SCROLL_TO_HOUR = 7;

const TIME_FORMAT: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
};

const WEEKDAY_FORMAT: Intl.DateTimeFormatOptions = { weekday: "short" };

interface TimeGridProps {
  /** Days to render as columns: 1 (day view) or 7 (week view). */
  days: Date[];
  /** Events to bucket and place on their matching days. */
  events: CalendarEvent[];
  /** Called when an event is clicked to open its details. */
  onPeek?: (event: CalendarEvent) => void;
}

/** The header label for a day column, e.g. "Wed 15". */
function headerLabel(day: Date): string {
  return `${day.toLocaleDateString(undefined, WEEKDAY_FORMAT)} ${day.getDate()}`;
}

/** The chip label: local start time plus the event title. */
function eventLabel(event: CalendarEvent): string {
  const time = event.startAt.toLocaleTimeString(undefined, TIME_FORMAT);
  return `${time} · ${event.title}`;
}

/** The 24 hour-axis labels, "00:00" .. "23:00". */
function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/** An absolutely-positioned, read-only timed event block. */
function TimedEvent({
  positioned,
  onPeek,
}: {
  positioned: PositionedEvent;
  onPeek?: (event: CalendarEvent) => void;
}) {
  const { event, startMin, endMin, lane, lanes } = positioned;
  const label = eventLabel(event);

  return (
    <button
      type="button"
      title={label}
      onClick={() => onPeek?.(event)}
      style={{
        top: `${(startMin / MINUTES_PER_DAY) * 100}%`,
        height: `${((endMin - startMin) / MINUTES_PER_DAY) * 100}%`,
        left: `${(lane / lanes) * 100}%`,
        width: `calc(${(1 / lanes) * 100}% - 2px)`,
      }}
      className="absolute overflow-hidden rounded bg-secondary px-1.5 py-0.5 text-left text-xs text-secondary-foreground hover:bg-secondary/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span className="block truncate font-medium">{label}</span>
    </button>
  );
}

export function TimeGrid({ days, events, onPeek }: TimeGridProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => new Date());

  // Keep the "now" indicator live without setting state in the effect body
  // (satisfies react-hooks/set-state-in-effect: setState runs in the callback).
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Scroll the body so ~07:00 sits near the top on mount. Assigning scrollTop
  // in an effect is a DOM mutation, not React state.
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = SCROLL_TO_HOUR * HOUR_HEIGHT;
  }, []);

  const today = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const columnHeight = HOURS_IN_DAY * HOUR_HEIGHT;
  const gridTemplateColumns = `${GUTTER_WIDTH}px repeat(${days.length}, minmax(0, 1fr))`;

  // Bucket every day once so the header, all-day strip, and body share results.
  const layouts = days.map((day) => layoutDayEvents(events, day));

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border">
      {/* Header: empty gutter + one cell per day. */}
      <div className="grid border-b border-border" style={{ gridTemplateColumns }}>
        <div className="border-r border-border" />
        {days.map((day) => {
          const isToday = isSameDay(day, today);
          return (
            <div
              key={day.toISOString()}
              className={cn(
                "border-r border-border px-2 py-1.5 text-center text-xs font-medium last:border-r-0",
                isToday ? "text-primary" : "text-muted-foreground",
              )}
            >
              {headerLabel(day)}
            </div>
          );
        })}
      </div>

      {/* All-day strip: labeled gutter + per-day all-day chips. */}
      <div
        className="grid border-b border-border bg-muted/30"
        style={{ gridTemplateColumns }}
      >
        <div className="flex items-center justify-end border-r border-border px-2 py-1 text-[10px] text-muted-foreground">
          all-day
        </div>
        {layouts.map((layout, index) => (
          <div
            key={days[index].toISOString()}
            className="flex min-h-8 flex-col gap-1 border-r border-border p-1 last:border-r-0"
          >
            {layout.allDay.map((event) => (
              <button
                key={event.id}
                type="button"
                title={event.title}
                onClick={() => onPeek?.(event)}
                className="w-full truncate rounded bg-secondary px-1.5 py-0.5 text-left text-xs text-secondary-foreground hover:bg-secondary/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {event.title}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Scrollable body: hour axis gutter + per-day positioned columns. */}
      <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid" style={{ gridTemplateColumns }}>
          {/* Hour axis gutter: 24 labeled rows. */}
          <div className="border-r border-border">
            {Array.from({ length: HOURS_IN_DAY }, (_, hour) => (
              <div
                key={hour}
                style={{ height: HOUR_HEIGHT }}
                className="relative border-b border-border"
              >
                <span className="absolute -top-2 right-1 text-[10px] text-muted-foreground">
                  {hour === 0 ? "" : hourLabel(hour)}
                </span>
              </div>
            ))}
          </div>

          {/* One relative-positioned column per day. */}
          {layouts.map((layout, index) => {
            const day = days[index];
            const isToday = isSameDay(day, today);
            return (
              <div
                key={day.toISOString()}
                style={{ height: columnHeight }}
                className="relative border-r border-border last:border-r-0"
              >
                {/* Horizontal hour lines. */}
                {Array.from({ length: HOURS_IN_DAY }, (_, hour) => (
                  <div
                    key={hour}
                    style={{ height: HOUR_HEIGHT }}
                    className="border-b border-border"
                  />
                ))}

                {/* Timed event blocks. */}
                {layout.timed.map((positioned) => (
                  <TimedEvent
                    key={positioned.event.id}
                    positioned={positioned}
                    onPeek={onPeek}
                  />
                ))}

                {/* Live "now" indicator (today only). */}
                {isToday ? (
                  <div
                    aria-hidden
                    style={{ top: `${(nowMinutes / MINUTES_PER_DAY) * 100}%` }}
                    className="pointer-events-none absolute inset-x-0 z-10 border-t border-primary"
                  >
                    <span className="absolute -top-1 -left-1 h-2 w-2 rounded-full bg-primary" />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
