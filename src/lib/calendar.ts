import type { PlanningItem } from "@prisma/client";

/**
 * Pure calendar logic — grid construction, range windows, and event bucketing.
 * Kept free of React so it is fully unit-testable; the calendar components are
 * thin renderers over these helpers. All date math is LOCAL: the API returns
 * UTC ISO strings, which `toCalendarEvents` parses into `Date`s that are then
 * placed on local calendar days.
 */

export type CalendarView = "month" | "agenda";

/** A scheduled item projected for the calendar (dates parsed from the API). */
export interface CalendarEvent {
  id: string;
  title: string;
  startAt: Date;
  endAt: Date | null;
  allDay: boolean;
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
    });
  }
  return events;
}
