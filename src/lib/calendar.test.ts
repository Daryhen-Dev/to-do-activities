import { describe, expect, it } from "vitest";
import type { PlanningItem } from "@prisma/client";
import {
  buildMonthGrid,
  eventsOnDay,
  groupEventsByDay,
  isSameDay,
  rangeFor,
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
