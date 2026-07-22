import { describe, expect, it } from "vitest";
import { formatReminderTime, selectNewlyDueIds } from "./reminders";

describe("selectNewlyDueIds", () => {
  it("returns all ids when nothing is known yet", () => {
    const known = new Set<string>();
    const due = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(selectNewlyDueIds(known, due)).toEqual(["a", "b", "c"]);
  });

  it("excludes ids already known (toast-once)", () => {
    const known = new Set(["a", "c"]);
    const due = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    expect(selectNewlyDueIds(known, due)).toEqual(["b", "d"]);
  });

  it("returns an empty array when every due id is known", () => {
    const known = new Set(["a", "b"]);
    const due = [{ id: "a" }, { id: "b" }];
    expect(selectNewlyDueIds(known, due)).toEqual([]);
  });

  it("collapses duplicate ids within the due list", () => {
    const known = new Set<string>();
    const due = [{ id: "a" }, { id: "a" }, { id: "b" }];
    expect(selectNewlyDueIds(known, due)).toEqual(["a", "b"]);
  });

  it("is stable across repeated calls with the same inputs", () => {
    const known = new Set(["x"]);
    const due = [{ id: "x" }, { id: "y" }];
    expect(selectNewlyDueIds(known, due)).toEqual(
      selectNewlyDueIds(known, due),
    );
  });
});

describe("formatReminderTime", () => {
  const now = new Date("2026-07-21T12:00:00.000Z");

  it("labels sub-minute distances as 'just now'", () => {
    expect(formatReminderTime(new Date("2026-07-21T12:00:30.000Z"), now)).toBe(
      "just now",
    );
    expect(formatReminderTime(new Date("2026-07-21T11:59:40.000Z"), now)).toBe(
      "just now",
    );
  });

  it("labels minutes in the past and future", () => {
    expect(formatReminderTime(new Date("2026-07-21T11:55:00.000Z"), now)).toBe(
      "5 min ago",
    );
    expect(formatReminderTime(new Date("2026-07-21T12:10:00.000Z"), now)).toBe(
      "in 10 min",
    );
  });

  it("labels hours in the past and future", () => {
    expect(formatReminderTime(new Date("2026-07-21T09:00:00.000Z"), now)).toBe(
      "3 h ago",
    );
    expect(formatReminderTime(new Date("2026-07-21T14:00:00.000Z"), now)).toBe(
      "in 2 h",
    );
  });

  it("falls back to an absolute label for distances of a day or more", () => {
    const label = formatReminderTime(
      new Date("2026-07-25T08:00:00.000Z"),
      now,
    );
    expect(label).not.toBe("just now");
    expect(label).not.toMatch(/min ago|in \d+ min|h ago|in \d+ h/);
  });

  it("is deterministic for the same inputs", () => {
    const remindAt = new Date("2026-07-21T12:30:00.000Z");
    expect(formatReminderTime(remindAt, now)).toBe(
      formatReminderTime(remindAt, now),
    );
  });
});


// ---------------------------------------------------------------------------
// Recurring reminders: current occurrence + watermark due predicate.
// ---------------------------------------------------------------------------

import fc from "fast-check";
import {
  currentReminderOccurrence,
  hasRecurrenceRule,
  isRecurringReminderDue,
  reminderOccurrenceInstant,
} from "./reminders";
import { normalizeDate, type RecurrenceRule } from "./habits";

/** A daily rule at 09:00, anchored well before the test "now". */
function dailyAt(minutes: number): RecurrenceRule {
  return {
    days: [1, 2, 3, 4, 5, 6, 7],
    interval: null,
    anchor: new Date(2026, 0, 1),
    timeMinutes: minutes,
  };
}

describe("hasRecurrenceRule", () => {
  it("is true with weekdays or an interval, false otherwise", () => {
    expect(hasRecurrenceRule(dailyAt(540))).toBe(true);
    expect(
      hasRecurrenceRule({ days: [], interval: 3, anchor: new Date(2026, 0, 1), timeMinutes: null }),
    ).toBe(true);
    expect(
      hasRecurrenceRule({ days: [], interval: null, anchor: new Date(2026, 0, 1), timeMinutes: 540 }),
    ).toBe(false);
  });
});

describe("reminderOccurrenceInstant", () => {
  it("anchors the occurrence date at its time-of-day (00:00 when null)", () => {
    const d = new Date(2026, 6, 20);
    expect(reminderOccurrenceInstant(d, 540).getTime()).toBe(
      new Date(2026, 6, 20, 9, 0).getTime(),
    );
    expect(reminderOccurrenceInstant(d, null).getTime()).toBe(
      new Date(2026, 6, 20, 0, 0).getTime(),
    );
  });
});

describe("currentReminderOccurrence", () => {
  it("returns the latest occurrence instant at or before now", () => {
    const rule = dailyAt(540); // 09:00 daily
    // now = Jul 20 2026, 10:00 → current occurrence is Jul 20 09:00
    const now = new Date(2026, 6, 20, 10, 0);
    expect(currentReminderOccurrence(rule, now)?.getTime()).toBe(
      new Date(2026, 6, 20, 9, 0).getTime(),
    );
  });

  it("returns the prior day's occurrence before today's time arrives", () => {
    const rule = dailyAt(540);
    // now = Jul 20 08:00 (before 09:00) → current is Jul 19 09:00
    const now = new Date(2026, 6, 20, 8, 0);
    expect(currentReminderOccurrence(rule, now)?.getTime()).toBe(
      new Date(2026, 6, 19, 9, 0).getTime(),
    );
  });

  it("returns null when the rule schedules nothing at or before now", () => {
    const rule: RecurrenceRule = {
      days: [],
      interval: 3,
      anchor: new Date(2026, 6, 25), // anchor in the future
      timeMinutes: 540,
    };
    expect(currentReminderOccurrence(rule, new Date(2026, 6, 20, 10, 0))).toBeNull();
  });

  // Property 3: current occurrence is the latest occurrence at or before now.
  it("is ≤ now and nothing scheduled lies strictly between it and now (property)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1439 }),
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 0, max: 1439 }),
        (ruleMin, dayOffset, nowMin) => {
          const rule = dailyAt(ruleMin);
          const base = new Date(2026, 6, 20);
          const now = new Date(
            2026,
            6,
            20 + dayOffset,
            Math.floor(nowMin / 60),
            nowMin % 60,
          );
          void base;
          const occ = currentReminderOccurrence(rule, now);
          expect(occ).not.toBeNull();
          if (occ) {
            expect(occ.getTime()).toBeLessThanOrEqual(now.getTime());
            // The next day's instant would be > now (daily rule).
            const next = new Date(occ);
            next.setDate(next.getDate() + 1);
            expect(next.getTime()).toBeGreaterThan(now.getTime());
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("isRecurringReminderDue", () => {
  const rule = dailyAt(540); // 09:00 daily
  const now = new Date(2026, 6, 20, 10, 0); // current occurrence Jul 20 09:00

  it("is due when the watermark is null", () => {
    expect(isRecurringReminderDue(rule, null, now)).toBe(true);
  });

  it("is due when the watermark is before the current occurrence", () => {
    expect(
      isRecurringReminderDue(rule, new Date(2026, 6, 19, 9, 0), now),
    ).toBe(true);
  });

  it("is not due when the watermark is at or after the current occurrence", () => {
    expect(
      isRecurringReminderDue(rule, new Date(2026, 6, 20, 9, 0), now),
    ).toBe(false);
    expect(
      isRecurringReminderDue(rule, new Date(2026, 6, 20, 9, 30), now),
    ).toBe(false);
  });

  it("is not due when there is no occurrence at or before now", () => {
    const future: RecurrenceRule = {
      days: [],
      interval: 3,
      anchor: new Date(2026, 6, 25),
      timeMinutes: 540,
    };
    expect(isRecurringReminderDue(future, null, now)).toBe(false);
  });

  // Property 1: due predicate matches the watermark rule.
  it("matches occurrence-exists AND watermark-before-instant (property)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1439 }),
        fc.option(fc.integer({ min: -5, max: 5 }), { nil: null }),
        (ruleMin, seenDayOffset) => {
          const r = dailyAt(ruleMin);
          const nowV = new Date(2026, 6, 20, 12, 0);
          const occ = currentReminderOccurrence(r, nowV);
          const seenAt =
            seenDayOffset === null
              ? null
              : new Date(2026, 6, 20 + seenDayOffset, 12, 0);
          const expected =
            occ !== null && (seenAt === null || seenAt.getTime() < occ.getTime());
          expect(isRecurringReminderDue(r, seenAt, nowV)).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property 2: dismissing at now clears the current occurrence and re-arms next.
  it("dismiss at now clears current and the next occurrence becomes due (property)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1439 }), (ruleMin) => {
        const r = dailyAt(ruleMin);
        const nowV = new Date(2026, 6, 20, 23, 59);
        const occ = currentReminderOccurrence(r, nowV);
        expect(occ).not.toBeNull();
        // Dismiss: watermark = now → not due now.
        expect(isRecurringReminderDue(r, nowV, nowV)).toBe(false);
        // At the next day's instant, it is due again (watermark now < it).
        const next = new Date(occ as Date);
        next.setDate(next.getDate() + 1);
        expect(isRecurringReminderDue(r, nowV, next)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});

describe("normalizeDate re-export sanity", () => {
  it("normalizeDate strips the time component", () => {
    expect(normalizeDate(new Date(2026, 6, 20, 15, 30)).getHours()).toBe(0);
  });
});
