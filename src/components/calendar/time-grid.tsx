"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Check, Repeat } from "lucide-react";

import {
  type CalendarEvent,
  type PositionedEvent,
  computeRescheduledSchedule,
  layoutDayEvents,
  MINUTES_PER_DAY,
  isSameDay,
} from "@/lib/calendar";
import { cn } from "@/lib/utils";

/**
 * Presentational week/day time grid. Renders a header row (one column per day),
 * an all-day strip, and a scrollable hour body where timed events are placed by
 * their layout position. A live "now" indicator marks the current time on
 * today's column. Works with 1 day (day view) or 7 days (week view), and
 * renders the grid even when there are no events.
 *
 * Timed events are read-only by default (click → `onPeek`). When `onReschedule`
 * is supplied, timed blocks become draggable via Pointer Events: a block
 * follows the pointer across columns, and on release the drop position resolves
 * to a target day + minute that is handed to `computeRescheduledSchedule`. A
 * drag that never crosses the movement threshold is treated as a click.
 * All-day chips stay static in both modes.
 */

/** Pixel height of a single hour row; the body is `24 * HOUR_HEIGHT` tall. */
const HOUR_HEIGHT = 48;

/** Number of hours (rows) in a day. */
const HOURS_IN_DAY = 24;

/** Left gutter width (hour axis / all-day label), aligned across all rows. */
const GUTTER_WIDTH = 64;

/** Minute at which the body auto-scrolls into view on mount (~07:00). */
const SCROLL_TO_HOUR = 7;

/** Pointer travel (px) before a press turns into a drag rather than a click. */
const DRAG_THRESHOLD = 4;

/** In-flight pointer drag of a single timed event block. */
interface DragState {
  /** The event being dragged. */
  event: CalendarEvent;
  /** Pointer that started the drag (guards against multi-touch crosstalk). */
  pointerId: number;
  /** Pointer origin recorded on pointer-down, in client coordinates. */
  originX: number;
  originY: number;
  /** Current pointer delta from the origin (drives the follow preview). */
  dx: number;
  dy: number;
  /** True once the pointer has traveled past `DRAG_THRESHOLD`. */
  dragging: boolean;
}

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
  /**
   * When provided, timed blocks become draggable and this is invoked with the
   * rescheduled window on drop. Absent → the grid stays read-only.
   */
  onReschedule?: (
    event: CalendarEvent,
    newStartAt: Date,
    newEndAt: Date | null,
  ) => void;
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

/**
 * An absolutely-positioned timed event block. Read-only when `draggable` is
 * false (click → `onPeek`); when `draggable`, pointer handlers drive the drag
 * and the block translates by `offset` while `dragging` so it follows the
 * pointer (including across columns in week view).
 */
function TimedEvent({
  positioned,
  onPeek,
  draggable,
  offset,
  dragging,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  positioned: PositionedEvent;
  onPeek?: (event: CalendarEvent) => void;
  draggable: boolean;
  offset: { dx: number; dy: number } | null;
  dragging: boolean;
  onPointerDown: (event: CalendarEvent, e: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: CalendarEvent, e: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: CalendarEvent, e: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  const { event, startMin, endMin, lane, lanes } = positioned;
  const label = eventLabel(event);
  // Combined view: color the block by its category (accent border + tint),
  // keeping readable text. Absent color → default block styling.
  const colored = Boolean(event.color);
  // A reminder is a read-only point marker: never draggable (its time is edited
  // in the task dialog), always peeks on click, and shows a bell + dashed accent.
  const isReminder = event.kind === "reminder";
  // A habit occurrence is also a read-only marker (never draggable): its
  // schedule is set in the habit form, not on the grid. A completed occurrence
  // is dimmed + struck through with a check.
  const isHabit = event.kind === "habit";
  const habitDone = isHabit && event.completed === true;
  const canDrag = draggable && !isReminder && !isHabit;

  return (
    <button
      type="button"
      title={label}
      // Read-only mode (and reminders) keep the click → peek behavior. In
      // draggable mode the click is resolved from pointer-up instead (a non-drag
      // press peeks), so no onClick is attached to avoid a double peek.
      onClick={canDrag ? undefined : () => onPeek?.(event)}
      onPointerDown={canDrag ? (e) => onPointerDown(event, e) : undefined}
      onPointerMove={canDrag ? (e) => onPointerMove(event, e) : undefined}
      onPointerUp={canDrag ? (e) => onPointerUp(event, e) : undefined}
      style={{
        top: `${(startMin / MINUTES_PER_DAY) * 100}%`,
        height: `${((endMin - startMin) / MINUTES_PER_DAY) * 100}%`,
        left: `${(lane / lanes) * 100}%`,
        width: `calc(${(1 / lanes) * 100}% - 2px)`,
        transform:
          dragging && offset
            ? `translate(${offset.dx}px, ${offset.dy}px)`
            : undefined,
        zIndex: dragging ? 20 : undefined,
        ...(colored
          ? { borderLeftColor: event.color, backgroundColor: `${event.color}26` }
          : {}),
      }}
      className={cn(
        "absolute overflow-hidden rounded px-1.5 py-0.5 text-left text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        colored
          ? "border-l-[3px] text-foreground hover:opacity-80"
          : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        isReminder && "border-dashed",
        isHabit && "border-dotted",
        habitDone && "opacity-60 line-through",
        canDrag && "cursor-grab touch-none",
        dragging && "cursor-grabbing select-none shadow-lg",
      )}
    >
      <span className="flex items-center gap-1 truncate font-medium">
        {isReminder ? <Bell aria-hidden className="size-3 shrink-0" /> : null}
        {isHabit ? (
          habitDone ? (
            <Check aria-hidden className="size-3 shrink-0" />
          ) : (
            <Repeat aria-hidden className="size-3 shrink-0" />
          )
        ) : null}
        <span className="truncate">{label}</span>
      </span>
    </button>
  );
}

export function TimeGrid({ days, events, onPeek, onReschedule }: TimeGridProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  // One DOM ref per day column, kept parallel to `days`, so a drop position can
  // be resolved to the column it landed in via getBoundingClientRect().
  const columnRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [drag, setDrag] = useState<DragState | null>(null);

  const draggable = Boolean(onReschedule);

  // Begin a pending drag: capture the pointer so move/up keep firing on the
  // block even if the pointer leaves it, and record the origin. The press is
  // not yet a drag (it may resolve to a click on pointer-up).
  const handlePointerDown = (
    event: CalendarEvent,
    e: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (!onReschedule) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({
      event,
      pointerId: e.pointerId,
      originX: e.clientX,
      originY: e.clientY,
      dx: 0,
      dy: 0,
      dragging: false,
    });
  };

  // Track pointer delta; cross the threshold once to enter the dragging state.
  const handlePointerMove = (
    event: CalendarEvent,
    e: React.PointerEvent<HTMLButtonElement>,
  ) => {
    setDrag((prev) => {
      if (!prev || prev.event.id !== event.id || prev.pointerId !== e.pointerId) {
        return prev;
      }
      const dx = e.clientX - prev.originX;
      const dy = e.clientY - prev.originY;
      const dragging = prev.dragging || Math.hypot(dx, dy) > DRAG_THRESHOLD;
      return { ...prev, dx, dy, dragging };
    });
  };

  // Resolve the gesture: a non-drag press peeks; a real drag resolves the drop
  // to a day column + minute and reschedules. A drop outside every column is a
  // no-op. Either way, drag state is cleared.
  const handlePointerUp = (
    event: CalendarEvent,
    e: React.PointerEvent<HTMLButtonElement>,
  ) => {
    const state = drag;
    setDrag(null);
    if (!state || state.event.id !== event.id) return;

    if (!state.dragging) {
      onPeek?.(event);
      return;
    }
    if (!onReschedule) return;

    // Find the day column horizontally containing the drop point.
    const targetIndex = columnRefs.current.findIndex((col) => {
      if (!col) return false;
      const rect = col.getBoundingClientRect();
      return e.clientX >= rect.left && e.clientX < rect.right;
    });
    if (targetIndex === -1) return; // Dropped outside any column → no-op.

    const column = columnRefs.current[targetIndex];
    if (!column) return;
    const rect = column.getBoundingClientRect();
    const targetMinute = ((e.clientY - rect.top) / HOUR_HEIGHT) * 60;
    const { startAt, endAt } = computeRescheduledSchedule(
      event,
      days[targetIndex],
      targetMinute,
    );
    onReschedule(event, startAt, endAt);
  };

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
            {layout.allDay.map((event) => {
              const colored = Boolean(event.color);
              const isHabit = event.kind === "habit";
              const habitDone = isHabit && event.completed === true;
              return (
                <button
                  key={event.id}
                  type="button"
                  title={event.title}
                  onClick={() => onPeek?.(event)}
                  style={
                    colored
                      ? {
                          borderLeftColor: event.color,
                          backgroundColor: `${event.color}26`,
                        }
                      : undefined
                  }
                  className={cn(
                    "flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    colored
                      ? "border-l-[3px] text-foreground hover:opacity-80"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                    isHabit && "border-dotted",
                    habitDone && "opacity-60 line-through",
                  )}
                >
                  {isHabit ? (
                    habitDone ? (
                      <Check aria-hidden className="size-3 shrink-0" />
                    ) : (
                      <Repeat aria-hidden className="size-3 shrink-0" />
                    )
                  ) : null}
                  <span className="truncate">{event.title}</span>
                </button>
              );
            })}
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
                ref={(el) => {
                  columnRefs.current[index] = el;
                }}
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
                {layout.timed.map((positioned) => {
                  const isDragged = drag?.event.id === positioned.event.id;
                  return (
                    <TimedEvent
                      key={positioned.event.id}
                      positioned={positioned}
                      onPeek={onPeek}
                      draggable={draggable}
                      offset={
                        isDragged ? { dx: drag.dx, dy: drag.dy } : null
                      }
                      dragging={Boolean(isDragged && drag?.dragging)}
                      onPointerDown={handlePointerDown}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                    />
                  );
                })}

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
