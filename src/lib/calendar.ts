import type { PlanningItem } from "@prisma/client";

/**
 * Pure calendar logic — grid construction, range windows, and event bucketing.
 * Kept free of React so it is fully unit-testable; the calendar components are
 * thin renderers over these helpers. All date math is LOCAL: the API returns
 * UTC ISO strings, which `toCalendarEvents` parses into `Date`s that are then
 * placed on local calendar days.
 */

export type CalendarView = "month" | "week" | "day" | "agenda";

/** A scheduled item projected for the calendar (dates parsed from the API). */
export interface CalendarEvent {
  id: string;
  title: string;
  startAt: Date;
  endAt: Date | null;
  allDay: boolean;
  /** Optional details shown in the event peek panel. */
  description?: string | null;
}

/** How many days ahead the agenda window looks. */
const AGENDA_DAYS = 30;

/** Local midnight at the start of `date`'s day. */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** A new date `days` after `date` (local, DST-safe via setDate). */
function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** True when `a` and `b` fall on the same local calendar day. */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Builds the week-aligned grid of days covering `anchor`'s month. Every row is
 * a full week (7 days); the grid starts on the `weekStartsOn` weekday of the
 * week containing the 1st, and ends on the week containing the last day of the
 * month. Days outside the anchor month are included to complete those weeks.
 */
export function buildMonthGrid(
  anchor: Date,
  weekStartsOn: 0 | 1 = 0,
): Date[][] {
  const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const lastOfMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);

  // Walk back from the 1st to the week-start weekday.
  const leadOffset = (firstOfMonth.getDay() - weekStartsOn + 7) % 7;
  const gridStart = addDays(firstOfMonth, -leadOffset);

  // Walk forward from the last day to the end of its week.
  const trailOffset = (weekStartsOn + 6 - lastOfMonth.getDay() + 7) % 7;
  const gridEnd = addDays(lastOfMonth, trailOffset);

  const weeks: Date[][] = [];
  let cursor = gridStart;
  while (cursor.getTime() <= gridEnd.getTime()) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i += 1) {
      week.push(cursor);
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/** Local midnight of the week-start day for the week containing `date`. */
export function startOfWeek(date: Date, weekStartsOn: 0 | 1 = 0): Date {
  const start = startOfDay(date);
  const offset = (start.getDay() - weekStartsOn + 7) % 7;
  return addDays(start, -offset);
}

/** The 7 local days of `anchor`'s week (week-start aligned). */
export function buildWeekDays(anchor: Date, weekStartsOn: 0 | 1 = 0): Date[] {
  const start = startOfWeek(anchor, weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/**
 * The `[from, to)` window the calendar needs data for. Month view spans the
 * full grid (so leading/trailing days show their events); agenda spans from the
 * start of today through `AGENDA_DAYS` ahead. Both boundaries are local, and
 * `from < to` always holds.
 */
export function rangeFor(
  view: CalendarView,
  anchor: Date,
): { from: Date; to: Date } {
  if (view === "agenda") {
    const from = startOfDay(anchor);
    return { from, to: addDays(from, AGENDA_DAYS) };
  }
  if (view === "day") {
    const from = startOfDay(anchor);
    return { from, to: addDays(from, 1) };
  }
  if (view === "week") {
    const from = startOfWeek(anchor);
    return { from, to: addDays(from, 7) };
  }
  const weeks = buildMonthGrid(anchor);
  const from = weeks[0][0];
  const lastDay = weeks[weeks.length - 1][6];
  return { from, to: addDays(lastDay, 1) };
}

/**
 * Events whose local time interval `[startAt, endAt ?? startAt]` intersects
 * `day`. Single-day events appear once; multi-day events appear on every day
 * they cover.
 */
export function eventsOnDay(
  events: CalendarEvent[],
  day: Date,
): CalendarEvent[] {
  const dayStart = startOfDay(day);
  const nextDay = addDays(dayStart, 1);
  return events.filter((event) => {
    const start = event.startAt;
    const end = event.endAt ?? event.startAt;
    // Interval [start, end] intersects [dayStart, nextDay): start < nextDay and
    // end >= dayStart.
    return (
      start.getTime() < nextDay.getTime() &&
      end.getTime() >= dayStart.getTime()
    );
  });
}

/**
 * Upcoming events (starting at/after `from`) grouped by local day and ordered
 * chronologically — both the groups and the events within each group.
 */
export function groupEventsByDay(
  events: CalendarEvent[],
  from: Date,
): { day: Date; events: CalendarEvent[] }[] {
  const fromStart = startOfDay(from);
  const upcoming = events
    .filter((event) => event.startAt.getTime() >= fromStart.getTime())
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

  const groups: { day: Date; events: CalendarEvent[] }[] = [];
  for (const event of upcoming) {
    const last = groups[groups.length - 1];
    if (last && isSameDay(last.day, event.startAt)) {
      last.events.push(event);
    } else {
      groups.push({ day: startOfDay(event.startAt), events: [event] });
    }
  }
  return groups;
}

/**
 * Maps API rows (with UTC ISO date strings or `Date`s) into `CalendarEvent`s,
 * keeping only scheduled items (those with a `startAt`).
 */
export function toCalendarEvents(rows: PlanningItem[]): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const row of rows) {
    if (!row.startAt) continue;
    const startAt = new Date(row.startAt);
    if (Number.isNaN(startAt.getTime())) continue;
    const end = row.endAt ? new Date(row.endAt) : null;
    events.push({
      id: row.id,
      title: row.title,
      startAt,
      endAt: end && !Number.isNaN(end.getTime()) ? end : null,
      allDay: row.allDay,
      description: row.description ?? null,
    });
  }
  return events;
}

/** Minutes in a day; timed events are positioned within `[0, 1440]`. */
export const MINUTES_PER_DAY = 1440;

/** Minimum rendered block length so very short events stay clickable. */
export const MIN_EVENT_MINUTES = 30;

/** A timed event positioned within a single day's hour grid. */
export interface PositionedEvent {
  event: CalendarEvent;
  /** Minutes from local midnight, clamped to [0, 1440]. */
  startMin: number;
  /** End minutes; always `> startMin` (min duration enforced). */
  endMin: number;
  /** 0-based overlap lane within the event's cluster. */
  lane: number;
  /** Total lanes in the event's overlap cluster. */
  lanes: number;
}

/** A day's events split into an all-day strip and laid-out timed blocks. */
export interface DayLayout {
  allDay: CalendarEvent[];
  timed: PositionedEvent[];
}

function clampMinute(value: number): number {
  return Math.max(0, Math.min(MINUTES_PER_DAY, value));
}

/**
 * Splits `day`'s events into an all-day strip and a laid-out set of timed
 * blocks. Timed events are clamped to the day's `[0, 1440]` bounds, given a
 * minimum height, and assigned side-by-side lanes so overlapping events stay
 * visible: events are grouped into clusters of mutual overlap, and within a
 * cluster each event takes the first lane whose previous event already ended;
 * `lanes` is the cluster's peak concurrency.
 */
export function layoutDayEvents(
  events: CalendarEvent[],
  day: Date,
): DayLayout {
  const dayStart = startOfDay(day).getTime();
  const dayEnd = dayStart + MINUTES_PER_DAY * 60_000;

  const allDay: CalendarEvent[] = [];
  const intervals: { event: CalendarEvent; startMin: number; endMin: number }[] =
    [];

  for (const event of events) {
    if (event.allDay) {
      // Only strip events that actually touch this day.
      const s = event.startAt.getTime();
      const e = (event.endAt ?? event.startAt).getTime();
      if (s < dayEnd && e >= dayStart) allDay.push(event);
      continue;
    }

    const startMs = event.startAt.getTime();
    const endMs = (event.endAt ?? event.startAt).getTime();
    // Timed membership: intersects the day, or is a point within the day.
    const intersects = startMs < dayEnd && endMs > dayStart;
    const pointInDay = startMs >= dayStart && startMs < dayEnd;
    if (!intersects && !pointInDay) continue;

    let startMin = clampMinute(Math.round((startMs - dayStart) / 60_000));
    let endMin = clampMinute(Math.round((endMs - dayStart) / 60_000));
    if (endMin - startMin < MIN_EVENT_MINUTES) {
      endMin = Math.min(startMin + MIN_EVENT_MINUTES, MINUTES_PER_DAY);
      if (endMin - startMin < MIN_EVENT_MINUTES) {
        startMin = Math.max(endMin - MIN_EVENT_MINUTES, 0);
      }
    }
    intervals.push({ event, startMin, endMin });
  }

  intervals.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const timed: PositionedEvent[] = [];
  let cluster: { event: CalendarEvent; startMin: number; endMin: number }[] = [];
  let clusterEnd = -1;

  const flush = () => {
    if (cluster.length === 0) return;
    const laneEnds: number[] = [];
    const withLane = cluster.map((iv) => {
      let lane = laneEnds.findIndex((end) => end <= iv.startMin);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(iv.endMin);
      } else {
        laneEnds[lane] = iv.endMin;
      }
      return { ...iv, lane };
    });
    const lanes = laneEnds.length;
    for (const w of withLane) {
      timed.push({
        event: w.event,
        startMin: w.startMin,
        endMin: w.endMin,
        lane: w.lane,
        lanes,
      });
    }
    cluster = [];
    clusterEnd = -1;
  };

  for (const iv of intervals) {
    if (cluster.length > 0 && iv.startMin >= clusterEnd) flush();
    cluster.push(iv);
    clusterEnd = Math.max(clusterEnd, iv.endMin);
  }
  flush();

  return { allDay, timed };
}
