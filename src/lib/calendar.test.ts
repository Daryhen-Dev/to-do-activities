import { describe, expect, it } from "vitest";
import type { PlanningItem } from "@prisma/client";
import {
  buildMonthGrid,
  buildWeekDays,
  eventsOnDay,
  groupEventsByDay,
  isSameDay,
  layoutDayEvents,
  MIN_EVENT_MINUTES,
  MINUTES_PER_DAY,
  rangeFor,
  startOfWeek,
  toCalendarEvents,
  type CalendarEvent,
} from "./calendar";

/**
 * Exhaustive unit tests for the pure calendar helpers. Every `Date` is built
 * with the LOCAL constructor `new Date(y, monthIndex, d, ...)` so the local
 * date math in the implementation is exercised deterministically regardless of
 * the machine's timezone.
 */

/** Builds a CalendarEvent with sensible defaults for the fields under test. */
function makeEvent(overrides: Partial<CalendarEvent> & { startAt: Date }): CalendarEvent {
  return {
    id: overrides.id ?? "e",
    title: overrides.title ?? "Event",
    startAt: overrides.startAt,
    endAt: overrides.endAt ?? null,
    allDay: overrides.allDay ?? false,
  };
}

/** Builds a PlanningItem-shaped row for toCalendarEvents (ISO strings in). */
function makeRow(row: {
  id: string;
  title: string;
  startAt: string | null;
  endAt: string | null;
  allDay?: boolean;
}): PlanningItem {
  return {
    id: row.id,
    title: row.title,
    startAt: row.startAt,
    endAt: row.endAt,
    allDay: row.allDay ?? false,
  } as unknown as PlanningItem;
}

describe("buildMonthGrid", () => {
  // (year, monthIndex, expected number of days) — a spread of month lengths.
  const months: Array<{ label: string; year: number; month: number }> = [
    { label: "28-day (Feb 2026)", year: 2026, month: 1 },
    { label: "30-day (Apr 2026)", year: 2026, month: 3 },
    { label: "31-day (Jul 2026)", year: 2026, month: 6 },
    // Feb 2026 starts on a Sunday, so with weekStartsOn=0 there are no leading
    // days; covered explicitly below too.
  ];

  for (const { label, year, month } of months) {
    describe(label, () => {
      it("has every row of length 7 and a total divisible by 7", () => {
        const grid = buildMonthGrid(new Date(year, month, 15));
        expect(grid.length).toBeGreaterThan(0);
        for (const week of grid) {
          expect(week).toHaveLength(7);
        }
        const total = grid.reduce((acc, week) => acc + week.length, 0);
        expect(total % 7).toBe(0);
      });

      it("includes the anchor month's first and last day", () => {
        const grid = buildMonthGrid(new Date(year, month, 15));
        const days = grid.flat();
        const firstOfMonth = new Date(year, month, 1);
        const lastOfMonth = new Date(year, month + 1, 0);
        expect(days.some((d) => isSameDay(d, firstOfMonth))).toBe(true);
        expect(days.some((d) => isSameDay(d, lastOfMonth))).toBe(true);
      });

      it("starts every row on Sunday by default (weekStartsOn=0)", () => {
        const grid = buildMonthGrid(new Date(year, month, 15));
        for (const week of grid) {
          expect(week[0].getDay()).toBe(0);
        }
      });

      it("starts every row on Monday when weekStartsOn=1", () => {
        const grid = buildMonthGrid(new Date(year, month, 15), 1);
        for (const week of grid) {
          expect(week[0].getDay()).toBe(1);
        }
        for (const week of grid) {
          expect(week).toHaveLength(7);
        }
      });
    });
  }

  it("produces contiguous days across the whole grid", () => {
    const grid = buildMonthGrid(new Date(2026, 6, 1));
    const days = grid.flat();
    for (let i = 1; i < days.length; i += 1) {
      const prev = days[i - 1];
      const expectedNext = new Date(
        prev.getFullYear(),
        prev.getMonth(),
        prev.getDate() + 1,
      );
      expect(isSameDay(days[i], expectedNext)).toBe(true);
    }
  });

  it("has no leading days when the 1st already falls on the week-start", () => {
    // Feb 2026: the 1st is a Sunday, so with weekStartsOn=0 the grid begins
    // exactly on the 1st (no trailing days from the previous month).
    const firstOfMonth = new Date(2026, 1, 1);
    expect(firstOfMonth.getDay()).toBe(0); // guard: confirm the setup
    const grid = buildMonthGrid(firstOfMonth);
    expect(isSameDay(grid[0][0], firstOfMonth)).toBe(true);
  });

  it("has no leading days when the 1st is Monday and weekStartsOn=1", () => {
    // Jun 2026: the 1st is a Monday.
    const firstOfMonth = new Date(2026, 5, 1);
    expect(firstOfMonth.getDay()).toBe(1); // guard: confirm the setup
    const grid = buildMonthGrid(firstOfMonth, 1);
    expect(isSameDay(grid[0][0], firstOfMonth)).toBe(true);
  });
});

describe("rangeFor", () => {
  describe("month", () => {
    it("spans from the grid's first day to the day after the grid's last day", () => {
      const anchor = new Date(2026, 6, 15);
      const grid = buildMonthGrid(anchor);
      const { from, to } = rangeFor("month", anchor);

      const gridFirst = grid[0][0];
      const gridLast = grid[grid.length - 1][6];
      const dayAfterLast = new Date(
        gridLast.getFullYear(),
        gridLast.getMonth(),
        gridLast.getDate() + 1,
      );

      expect(isSameDay(from, gridFirst)).toBe(true);
      expect(from.getTime()).toBe(gridFirst.getTime());
      expect(isSameDay(to, dayAfterLast)).toBe(true);
      expect(from.getTime()).toBeLessThan(to.getTime());
    });
  });

  describe("agenda", () => {
    it("spans from the start of the anchor's local day to 30 days later", () => {
      const anchor = new Date(2026, 6, 15, 14, 37);
      const { from, to } = rangeFor("agenda", anchor);

      const startOfAnchorDay = new Date(2026, 6, 15);
      const thirtyDaysLater = new Date(2026, 6, 15 + 30);

      expect(from.getTime()).toBe(startOfAnchorDay.getTime());
      expect(from.getHours()).toBe(0);
      expect(from.getMinutes()).toBe(0);
      expect(isSameDay(to, thirtyDaysLater)).toBe(true);
      expect(from.getTime()).toBeLessThan(to.getTime());
    });
  });
});

describe("eventsOnDay", () => {
  it("returns a single-day event only on its day, not adjacent days", () => {
    const day = new Date(2026, 6, 15);
    const event = makeEvent({ id: "single", startAt: new Date(2026, 6, 15, 9, 0) });
    const events = [event];

    expect(eventsOnDay(events, day)).toEqual([event]); // hit
    expect(eventsOnDay(events, new Date(2026, 6, 14))).toEqual([]); // miss (before)
    expect(eventsOnDay(events, new Date(2026, 6, 16))).toEqual([]); // miss (after)
  });

  it("returns a multi-day event on D, D+1, D+2 but not D-1 or D+3", () => {
    const event = makeEvent({
      id: "multi",
      startAt: new Date(2026, 6, 15, 10, 0),
      endAt: new Date(2026, 6, 17, 10, 0),
    });
    const events = [event];

    expect(eventsOnDay(events, new Date(2026, 6, 14))).toEqual([]); // D-1
    expect(eventsOnDay(events, new Date(2026, 6, 15))).toEqual([event]); // D
    expect(eventsOnDay(events, new Date(2026, 6, 16))).toEqual([event]); // D+1
    expect(eventsOnDay(events, new Date(2026, 6, 17))).toEqual([event]); // D+2
    expect(eventsOnDay(events, new Date(2026, 6, 18))).toEqual([]); // D+3
  });

  it("returns an all-day event (endAt null) on its start day", () => {
    const event = makeEvent({
      id: "allday",
      startAt: new Date(2026, 6, 15, 0, 0),
      endAt: null,
      allDay: true,
    });
    const events = [event];

    expect(eventsOnDay(events, new Date(2026, 6, 15))).toEqual([event]);
    expect(eventsOnDay(events, new Date(2026, 6, 16))).toEqual([]);
  });

  it("places an event at 23:59 local on that day, and 00:00 next on the next day", () => {
    const lateEvent = makeEvent({
      id: "late",
      startAt: new Date(2026, 6, 15, 23, 59),
    });
    const midnightEvent = makeEvent({
      id: "midnight",
      startAt: new Date(2026, 6, 16, 0, 0),
    });
    const events = [lateEvent, midnightEvent];

    expect(eventsOnDay(events, new Date(2026, 6, 15))).toEqual([lateEvent]);
    expect(eventsOnDay(events, new Date(2026, 6, 16))).toEqual([midnightEvent]);
  });
});

describe("groupEventsByDay", () => {
  it("filters out events before the start of the `from` local day", () => {
    const from = new Date(2026, 6, 15, 12, 0);
    const before = makeEvent({ id: "before", startAt: new Date(2026, 6, 14, 23, 0) });
    const sameDayEarly = makeEvent({
      id: "early",
      startAt: new Date(2026, 6, 15, 1, 0),
    });

    const groups = groupEventsByDay([before, sameDayEarly], from);
    const ids = groups.flatMap((g) => g.events.map((e) => e.id));
    expect(ids).toEqual(["early"]); // `before` dropped; `early` kept (>= start of day)
  });

  it("orders groups and events within a group by startAt", () => {
    const from = new Date(2026, 6, 15);
    const dayTwoLate = makeEvent({ id: "d2-late", startAt: new Date(2026, 6, 16, 18, 0) });
    const dayOneLate = makeEvent({ id: "d1-late", startAt: new Date(2026, 6, 15, 15, 0) });
    const dayOneEarly = makeEvent({ id: "d1-early", startAt: new Date(2026, 6, 15, 8, 0) });

    const groups = groupEventsByDay([dayTwoLate, dayOneLate, dayOneEarly], from);

    expect(groups).toHaveLength(2);
    expect(isSameDay(groups[0].day, new Date(2026, 6, 15))).toBe(true);
    expect(isSameDay(groups[1].day, new Date(2026, 6, 16))).toBe(true);
    expect(groups[0].events.map((e) => e.id)).toEqual(["d1-early", "d1-late"]);
    expect(groups[1].events.map((e) => e.id)).toEqual(["d2-late"]);
  });

  it("groups two events on the same local day into one group", () => {
    const from = new Date(2026, 6, 15);
    const a = makeEvent({ id: "a", startAt: new Date(2026, 6, 15, 8, 0) });
    const b = makeEvent({ id: "b", startAt: new Date(2026, 6, 15, 20, 0) });

    const groups = groupEventsByDay([a, b], from);
    expect(groups).toHaveLength(1);
    expect(groups[0].events.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("splits events on different local days into separate groups", () => {
    const from = new Date(2026, 6, 15);
    const a = makeEvent({ id: "a", startAt: new Date(2026, 6, 15, 8, 0) });
    const b = makeEvent({ id: "b", startAt: new Date(2026, 6, 16, 8, 0) });

    const groups = groupEventsByDay([a, b], from);
    expect(groups).toHaveLength(2);
    expect(groups[0].events.map((e) => e.id)).toEqual(["a"]);
    expect(groups[1].events.map((e) => e.id)).toEqual(["b"]);
  });
});

describe("toCalendarEvents", () => {
  it("parses ISO-string startAt/endAt into Date instances", () => {
    const startIso = new Date(2026, 6, 15, 9, 0).toISOString();
    const endIso = new Date(2026, 6, 15, 10, 0).toISOString();
    const rows = [
      makeRow({ id: "1", title: "Meeting", startAt: startIso, endAt: endIso }),
    ];

    const events = toCalendarEvents(rows);
    expect(events).toHaveLength(1);
    expect(events[0].startAt).toBeInstanceOf(Date);
    expect(events[0].endAt).toBeInstanceOf(Date);
    expect(events[0].startAt.getTime()).toBe(new Date(startIso).getTime());
    expect(events[0].endAt?.getTime()).toBe(new Date(endIso).getTime());
    expect(events[0].id).toBe("1");
    expect(events[0].title).toBe("Meeting");
  });

  it("keeps endAt null when the row's endAt is null", () => {
    const startIso = new Date(2026, 6, 15, 9, 0).toISOString();
    const rows = [makeRow({ id: "1", title: "Open", startAt: startIso, endAt: null })];

    const events = toCalendarEvents(rows);
    expect(events).toHaveLength(1);
    expect(events[0].endAt).toBeNull();
  });

  it("skips rows with a null startAt (unscheduled)", () => {
    const startIso = new Date(2026, 6, 15, 9, 0).toISOString();
    const rows = [
      makeRow({ id: "1", title: "Scheduled", startAt: startIso, endAt: null }),
      makeRow({ id: "2", title: "Unscheduled", startAt: null, endAt: null }),
    ];

    const events = toCalendarEvents(rows);
    expect(events.map((e) => e.id)).toEqual(["1"]);
  });

  it("preserves the allDay flag", () => {
    const startIso = new Date(2026, 6, 15, 0, 0).toISOString();
    const rows = [
      makeRow({ id: "1", title: "Holiday", startAt: startIso, endAt: null, allDay: true }),
    ];

    const events = toCalendarEvents(rows);
    expect(events[0].allDay).toBe(true);
  });
});

describe("startOfWeek / buildWeekDays", () => {
  it("returns exactly 7 consecutive local days", () => {
    const days = buildWeekDays(new Date(2026, 6, 15, 14, 30));
    expect(days).toHaveLength(7);
    for (let i = 1; i < days.length; i += 1) {
      const prev = days[i - 1];
      const expectedNext = new Date(
        prev.getFullYear(),
        prev.getMonth(),
        prev.getDate() + 1,
      );
      expect(isSameDay(days[i], expectedNext)).toBe(true);
    }
  });

  it("starts on Sunday when weekStartsOn=0", () => {
    const days = buildWeekDays(new Date(2026, 6, 15), 0); // Wed Jul 15 2026
    expect(days[0].getDay()).toBe(0);
    // Every day thereafter is +1.
    for (let i = 1; i < days.length; i += 1) {
      const prev = days[i - 1];
      expect(
        isSameDay(
          days[i],
          new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 1),
        ),
      ).toBe(true);
    }
  });

  it("starts on Monday when weekStartsOn=1", () => {
    const days = buildWeekDays(new Date(2026, 6, 15), 1);
    expect(days[0].getDay()).toBe(1);
    expect(days).toHaveLength(7);
  });

  it("works across a month boundary", () => {
    // Aug 1 2026 is a Saturday; the week (Sun-start) spans Jul 26 -> Aug 1.
    const days = buildWeekDays(new Date(2026, 7, 1), 0);
    expect(days).toHaveLength(7);
    expect(isSameDay(days[0], new Date(2026, 6, 26))).toBe(true); // Sun Jul 26
    expect(isSameDay(days[6], new Date(2026, 7, 1))).toBe(true); // Sat Aug 1
    // Days remain contiguous across the month change.
    for (let i = 1; i < days.length; i += 1) {
      const prev = days[i - 1];
      expect(
        isSameDay(
          days[i],
          new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 1),
        ),
      ).toBe(true);
    }
  });

  it("works across a year boundary (Dec -> Jan)", () => {
    // Jan 1 2027 is a Friday; the week (Sun-start) spans Dec 27 2026 -> Jan 2 2027.
    const days = buildWeekDays(new Date(2027, 0, 1), 0);
    expect(days).toHaveLength(7);
    expect(isSameDay(days[0], new Date(2026, 11, 27))).toBe(true); // Sun Dec 27 2026
    expect(isSameDay(days[6], new Date(2027, 0, 2))).toBe(true); // Sat Jan 2 2027
    for (let i = 1; i < days.length; i += 1) {
      const prev = days[i - 1];
      expect(
        isSameDay(
          days[i],
          new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 1),
        ),
      ).toBe(true);
    }
  });

  it("returns local midnight of the week-start day", () => {
    const start = startOfWeek(new Date(2026, 6, 15, 14, 37)); // Wed Jul 15
    expect(start.getDay()).toBe(0); // Sunday
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);
    expect(isSameDay(start, new Date(2026, 6, 12))).toBe(true); // Sun Jul 12
  });

  it("startOfWeek matches buildWeekDays' first day", () => {
    const anchor = new Date(2026, 6, 15, 9, 0);
    expect(startOfWeek(anchor, 1).getTime()).toBe(buildWeekDays(anchor, 1)[0].getTime());
  });
});

describe("rangeFor week/day", () => {
  it("day: from = start of the anchor's local day, to = +1 day", () => {
    const anchor = new Date(2026, 6, 15, 14, 37);
    const { from, to } = rangeFor("day", anchor);

    const startOfAnchorDay = new Date(2026, 6, 15);
    const nextDay = new Date(2026, 6, 16);

    expect(from.getTime()).toBe(startOfAnchorDay.getTime());
    expect(from.getHours()).toBe(0);
    expect(from.getMinutes()).toBe(0);
    expect(isSameDay(to, nextDay)).toBe(true);
    expect(from.getTime()).toBeLessThan(to.getTime());
  });

  it("week: from = startOfWeek(anchor), to = +7 days", () => {
    const anchor = new Date(2026, 6, 15, 14, 37);
    const { from, to } = rangeFor("week", anchor);

    const weekStart = startOfWeek(anchor);
    const weekEnd = new Date(
      weekStart.getFullYear(),
      weekStart.getMonth(),
      weekStart.getDate() + 7,
    );

    expect(from.getTime()).toBe(weekStart.getTime());
    expect(to.getTime()).toBe(weekEnd.getTime());
    expect(from.getTime()).toBeLessThan(to.getTime());
  });
});

describe("layoutDayEvents", () => {
  const day = new Date(2026, 6, 15);

  it("routes all-day events to allDay and never to timed", () => {
    const allDayEvent = makeEvent({
      id: "holiday",
      startAt: new Date(2026, 6, 15, 0, 0),
      allDay: true,
    });
    const { allDay, timed } = layoutDayEvents([allDayEvent], day);

    expect(allDay).toEqual([allDayEvent]);
    expect(timed).toHaveLength(0);
  });

  it("routes a timed event to timed and never to allDay", () => {
    const timedEvent = makeEvent({
      id: "meeting",
      startAt: new Date(2026, 6, 15, 9, 0),
      endAt: new Date(2026, 6, 15, 10, 0),
    });
    const { allDay, timed } = layoutDayEvents([timedEvent], day);

    expect(allDay).toHaveLength(0);
    expect(timed).toHaveLength(1);
    expect(timed[0].event).toBe(timedEvent);
  });

  it("clamps an event spilling in from the previous day to startMin = 0", () => {
    const spillIn = makeEvent({
      id: "spill-in",
      startAt: new Date(2026, 6, 14, 23, 0), // previous day 23:00
      endAt: new Date(2026, 6, 15, 1, 0), // this day 01:00
    });
    const { timed } = layoutDayEvents([spillIn], day);

    expect(timed).toHaveLength(1);
    expect(timed[0].startMin).toBe(0);
    expect(timed[0].endMin).toBe(60);
    expect(timed[0].startMin).toBeGreaterThanOrEqual(0);
    expect(timed[0].endMin).toBeLessThanOrEqual(MINUTES_PER_DAY);
  });

  it("clamps an event running past midnight to endMin = 1440", () => {
    const spillOut = makeEvent({
      id: "spill-out",
      startAt: new Date(2026, 6, 15, 23, 0), // this day 23:00
      endAt: new Date(2026, 6, 16, 1, 0), // next day 01:00
    });
    const { timed } = layoutDayEvents([spillOut], day);

    expect(timed).toHaveLength(1);
    expect(timed[0].startMin).toBe(23 * 60);
    expect(timed[0].endMin).toBe(MINUTES_PER_DAY);
    expect(timed[0].startMin).toBeGreaterThanOrEqual(0);
    expect(timed[0].endMin).toBeLessThanOrEqual(MINUTES_PER_DAY);
  });

  it("enforces MIN_EVENT_MINUTES when endAt is missing", () => {
    const point = makeEvent({
      id: "point",
      startAt: new Date(2026, 6, 15, 9, 0),
      endAt: null,
    });
    const { timed } = layoutDayEvents([point], day);

    expect(timed).toHaveLength(1);
    expect(timed[0].endMin - timed[0].startMin).toBe(MIN_EVENT_MINUTES);
  });

  it("enforces MIN_EVENT_MINUTES for a tiny (zero-length) duration", () => {
    const tiny = makeEvent({
      id: "tiny",
      startAt: new Date(2026, 6, 15, 9, 0),
      endAt: new Date(2026, 6, 15, 9, 0), // zero duration
    });
    const { timed } = layoutDayEvents([tiny], day);

    expect(timed).toHaveLength(1);
    expect(timed[0].endMin - timed[0].startMin).toBe(MIN_EVENT_MINUTES);
  });

  it("assigns lane 0 and lanes 1 to non-overlapping events", () => {
    const a = makeEvent({
      id: "a",
      startAt: new Date(2026, 6, 15, 9, 0),
      endAt: new Date(2026, 6, 15, 10, 0),
    });
    const b = makeEvent({
      id: "b",
      startAt: new Date(2026, 6, 15, 11, 0),
      endAt: new Date(2026, 6, 15, 12, 0),
    });
    const { timed } = layoutDayEvents([a, b], day);

    expect(timed).toHaveLength(2);
    for (const positioned of timed) {
      expect(positioned.lane).toBe(0);
      expect(positioned.lanes).toBe(1);
    }
  });

  it("assigns distinct lanes 0..N-1 and lanes = N to N mutually-overlapping events", () => {
    const a = makeEvent({
      id: "a",
      startAt: new Date(2026, 6, 15, 9, 0),
      endAt: new Date(2026, 6, 15, 12, 0),
    });
    const b = makeEvent({
      id: "b",
      startAt: new Date(2026, 6, 15, 9, 30),
      endAt: new Date(2026, 6, 15, 12, 0),
    });
    const c = makeEvent({
      id: "c",
      startAt: new Date(2026, 6, 15, 10, 0),
      endAt: new Date(2026, 6, 15, 12, 0),
    });
    const { timed } = layoutDayEvents([a, b, c], day);

    expect(timed).toHaveLength(3);
    for (const positioned of timed) {
      expect(positioned.lanes).toBe(3);
    }
    const lanes = timed.map((t) => t.lane).sort((x, y) => x - y);
    expect(lanes).toEqual([0, 1, 2]);
  });

  it("keeps overlapping pairs in different lanes for a partial-overlap set", () => {
    // A 9-10, B 9:30-11, C 10:30-12 — all one cluster (chained overlaps).
    const a = makeEvent({
      id: "a",
      startAt: new Date(2026, 6, 15, 9, 0),
      endAt: new Date(2026, 6, 15, 10, 0),
    });
    const b = makeEvent({
      id: "b",
      startAt: new Date(2026, 6, 15, 9, 30),
      endAt: new Date(2026, 6, 15, 11, 0),
    });
    const c = makeEvent({
      id: "c",
      startAt: new Date(2026, 6, 15, 10, 30),
      endAt: new Date(2026, 6, 15, 12, 0),
    });
    const { timed } = layoutDayEvents([a, b, c], day);

    expect(timed).toHaveLength(3);

    // Every event sits within a valid lane index.
    for (const positioned of timed) {
      expect(positioned.lane).toBeGreaterThanOrEqual(0);
      expect(positioned.lane).toBeLessThan(positioned.lanes);
    }

    // Overlapping pairs must not share a lane.
    const overlaps = (x: PositionedLike, y: PositionedLike) =>
      x.startMin < y.endMin && y.startMin < x.endMin;
    type PositionedLike = { startMin: number; endMin: number; lane: number };
    for (let i = 0; i < timed.length; i += 1) {
      for (let j = i + 1; j < timed.length; j += 1) {
        if (overlaps(timed[i], timed[j])) {
          expect(timed[i].lane).not.toBe(timed[j].lane);
        }
      }
    }
  });
});
