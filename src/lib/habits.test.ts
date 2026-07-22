import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  completedKeysFromRows,
  computeStreak,
  computeWeeklyAdherence,
  dateKey,
  fromDbDate,
  generateOccurrences,
  hmToMinutes,
  isScheduledOn,
  isoWeekday,
  minutesToHm,
  normalizeDate,
  normalizeDays,
  toDbDate,
  type RecurrenceRule,
} from "./habits";

/**
 * Unit + property tests for the pure recurrence helpers. Dates use the LOCAL
 * constructor so day math is exercised deterministically; `now`/`today` are
 * always injected. Property tests implement the design's correctness
 * properties; a model-based reference validates the generator and streak.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Independent restatement of the schedule predicate (the model). */
function refScheduled(rule: RecurrenceRule, date: Date): boolean {
  const hasDays = rule.days.length > 0;
  const hasInterval = rule.interval != null && rule.interval >= 1;
  if (!hasDays && !hasInterval) return false;
  const day = normalizeDate(date);
  if (hasDays) {
    const wd = day.getDay() === 0 ? 7 : day.getDay();
    if (!rule.days.includes(wd as never)) return false;
  }
  if (hasInterval) {
    const delta = Math.round(
      (day.getTime() - rule.anchor.getTime()) / DAY_MS,
    );
    if (delta < 0 || delta % (rule.interval as number) !== 0) return false;
  }
  return true;
}

const BASE = new Date(2026, 5, 15); // Mon Jun 15, 2026 (local)

/** Arbitrary recurrence rule anchored near BASE. */
const ruleArb = fc
  .record({
    days: fc.uniqueArray(fc.integer({ min: 1, max: 7 }), { maxLength: 7 }),
    interval: fc.option(fc.integer({ min: 1, max: 14 }), { nil: null }),
    anchorOffset: fc.integer({ min: -40, max: 0 }),
    timeMinutes: fc.option(fc.integer({ min: 0, max: 1439 }), { nil: null }),
  })
  .map(
    ({ days, interval, anchorOffset, timeMinutes }): RecurrenceRule => ({
      days: normalizeDays(days),
      interval,
      anchor: new Date(2026, 5, 15 + anchorOffset),
      timeMinutes,
    }),
  );

describe("isoWeekday", () => {
  it("maps Sunday to 7 and keeps Monday..Saturday as 1..6", () => {
    expect(isoWeekday(new Date(2026, 5, 14))).toBe(7); // Sunday
    expect(isoWeekday(new Date(2026, 5, 15))).toBe(1); // Monday
    expect(isoWeekday(new Date(2026, 5, 20))).toBe(6); // Saturday
  });
});

// Property 1: weekday normalization yields a distinct, sorted subset of 1..7
describe("Property 1: normalizeDays", () => {
  it("returns a strictly ascending, deduped subset of 1..7 with the same in-range set", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -3, max: 12 }), { maxLength: 30 }),
        (raw) => {
          const out = normalizeDays(raw);
          // strictly ascending, no duplicates
          for (let i = 1; i < out.length; i += 1) {
            expect(out[i]).toBeGreaterThan(out[i - 1]);
          }
          // subset of 1..7
          for (const d of out) {
            expect(d).toBeGreaterThanOrEqual(1);
            expect(d).toBeLessThanOrEqual(7);
          }
          // element set equals the input's in-range set
          const expected = new Set(raw.filter((d) => d >= 1 && d <= 7));
          expect(new Set(out)).toEqual(expected);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Property 8: time-of-day encoding round-trips
describe("Property 8: time-of-day encoding round-trip", () => {
  it("hmToMinutes/minutesToHm are inverse and encode within 0..1439", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 }),
        (hours, minutes) => {
          const encoded = hmToMinutes(hours, minutes);
          expect(encoded).toBeGreaterThanOrEqual(0);
          expect(encoded).toBeLessThanOrEqual(1439);
          expect(minutesToHm(encoded)).toEqual({ hours, minutes });
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Property 9: generation output is normalized, in-window, ordered, deduped, pure
describe("Property 9: generateOccurrences shape", () => {
  it("is normalized, in [from,to), strictly ascending, deduped, and pure", () => {
    fc.assert(
      fc.property(
        ruleArb,
        fc.integer({ min: -10, max: 30 }),
        fc.integer({ min: 0, max: 40 }),
        (rule, fromOffset, span) => {
          const from = new Date(2026, 5, 15 + fromOffset);
          const to = new Date(2026, 5, 15 + fromOffset + span);
          const out = generateOccurrences(rule, from, to);

          // empty when from >= to
          if (from.getTime() >= to.getTime()) {
            expect(out).toEqual([]);
            return;
          }
          const keys = new Set<string>();
          for (let i = 0; i < out.length; i += 1) {
            const d = out[i];
            // normalized: no time component
            expect(d.getHours()).toBe(0);
            expect(d.getMinutes()).toBe(0);
            expect(d.getSeconds()).toBe(0);
            expect(d.getMilliseconds()).toBe(0);
            // in [from, to)
            expect(d.getTime()).toBeGreaterThanOrEqual(from.getTime());
            expect(d.getTime()).toBeLessThan(to.getTime());
            // strictly ascending
            if (i > 0) {
              expect(d.getTime()).toBeGreaterThan(out[i - 1].getTime());
            }
            keys.add(dateKey(d));
          }
          // deduped
          expect(keys.size).toBe(out.length);
          // pure: identical inputs → deep-equal output
          const again = generateOccurrences(rule, from, to);
          expect(again).toEqual(out);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Property 10: generation includes exactly the dates satisfying the predicate
describe("Property 10: generateOccurrences membership (model-based)", () => {
  it("equals the in-window date-only values that satisfy the rule predicate", () => {
    fc.assert(
      fc.property(
        ruleArb,
        fc.integer({ min: -10, max: 20 }),
        fc.integer({ min: 0, max: 35 }),
        (rule, fromOffset, span) => {
          const from = new Date(2026, 5, 15 + fromOffset);
          const to = new Date(2026, 5, 15 + fromOffset + span);

          // naive model: day-by-day filter with the independent predicate
          const model: string[] = [];
          let cursor = normalizeDate(from);
          while (cursor.getTime() < to.getTime()) {
            if (
              cursor.getTime() >= from.getTime() &&
              refScheduled(rule, cursor)
            ) {
              model.push(dateKey(cursor));
            }
            const next = new Date(cursor);
            next.setDate(next.getDate() + 1);
            cursor = next;
          }

          const actual = generateOccurrences(rule, from, to).map(dateKey);
          expect(actual).toEqual(model);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("isScheduledOn", () => {
  it("agrees with the model predicate across a window", () => {
    const rule: RecurrenceRule = {
      days: [1, 3, 5],
      interval: null,
      anchor: BASE,
      timeMinutes: 480,
    };
    for (let i = 0; i < 14; i += 1) {
      const d = new Date(2026, 5, 15 + i);
      expect(isScheduledOn(rule, d)).toBe(refScheduled(rule, d));
    }
  });

  it("returns false for an empty rule (no weekday, no interval)", () => {
    const rule: RecurrenceRule = {
      days: [],
      interval: null,
      anchor: BASE,
      timeMinutes: null,
    };
    expect(isScheduledOn(rule, BASE)).toBe(false);
  });
});

// Property 11: streak counts consecutive completed scheduled occurrences and is
// unaffected by future or non-scheduled completions
describe("Property 11: computeStreak", () => {
  it("matches a backward-scan model and ignores future/non-scheduled completions", () => {
    fc.assert(
      fc.property(
        ruleArb,
        fc.array(fc.boolean(), { minLength: 0, maxLength: 30 }),
        (rule, completionFlags) => {
          const today = new Date(2026, 6, 20); // Jul 20, 2026
          // scheduled occurrences up to and including today
          const scheduled = generateOccurrences(
            rule,
            new Date(2026, 4, 1),
            new Date(2026, 6, 21),
          );
          // mark a subset complete, driven by the flags (newest-first)
          const completed = new Set<string>();
          for (let i = 0; i < scheduled.length; i += 1) {
            const flag = completionFlags[i % Math.max(1, completionFlags.length)];
            if (flag) completed.add(dateKey(scheduled[i]));
          }

          // model: walk newest-first, count until first gap
          let expected = 0;
          for (let i = scheduled.length - 1; i >= 0; i -= 1) {
            if (completed.has(dateKey(scheduled[i]))) expected += 1;
            else break;
          }

          expect(computeStreak(rule, completed, today)).toBe(expected);

          // adding a completion for a future date or a non-scheduled date must
          // not change the streak
          const noisy = new Set(completed);
          noisy.add(dateKey(new Date(2026, 6, 25))); // future
          noisy.add("1999-01-01"); // far past, non-scheduled key
          expect(computeStreak(rule, noisy, today)).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("is 0 when the most recent scheduled occurrence is not completed", () => {
    const rule: RecurrenceRule = {
      days: [1, 2, 3, 4, 5, 6, 7],
      interval: null,
      anchor: new Date(2026, 6, 1),
      timeMinutes: null,
    };
    const today = new Date(2026, 6, 20);
    // complete everything except today
    const completed = new Set<string>();
    for (let i = 1; i <= 19; i += 1) completed.add(dateKey(new Date(2026, 6, i)));
    expect(computeStreak(rule, completed, today)).toBe(0);
  });

  it("is 0 when there is no scheduled occurrence on or before today", () => {
    const rule: RecurrenceRule = {
      days: [],
      interval: 3,
      anchor: new Date(2026, 6, 25), // anchor is in the future
      timeMinutes: null,
    };
    const today = new Date(2026, 6, 20);
    expect(computeStreak(rule, new Set(), today)).toBe(0);
  });
});

// Property 12: weekly adherence matches the current-week schedule, never > total
describe("Property 12: computeWeeklyAdherence", () => {
  it("reports completed/total within the Monday..Monday week, completed ≤ total", () => {
    fc.assert(
      fc.property(ruleArb, fc.boolean(), (rule, completeAll) => {
        const now = new Date(2026, 6, 22, 10, 0); // Wed Jul 22, 2026
        // recompute the week window the same way the impl does
        const start = new Date(2026, 6, 22);
        const offset = (start.getDay() - 1 + 7) % 7;
        const weekStart = new Date(2026, 6, 22 - offset);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);
        const scheduled = generateOccurrences(rule, weekStart, weekEnd);

        const completed = new Set<string>();
        if (completeAll) for (const d of scheduled) completed.add(dateKey(d));

        const result = computeWeeklyAdherence(rule, completed, now);
        expect(result.total).toBe(scheduled.length);
        expect(result.completed).toBeLessThanOrEqual(result.total);
        expect(result.completed).toBe(completeAll ? scheduled.length : 0);
      }),
      { numRuns: 100 },
    );
  });

  it("reports 0 of 0 for a week with no scheduled occurrence", () => {
    const rule: RecurrenceRule = {
      days: [],
      interval: 90,
      anchor: new Date(2026, 0, 1),
      timeMinutes: null,
    };
    const now = new Date(2026, 6, 22, 10, 0);
    expect(computeWeeklyAdherence(rule, new Set(), now)).toEqual({
      completed: 0,
      total: 0,
    });
  });
});

describe("@db.Date round-trip helpers", () => {
  it("toDbDate → fromDbDate preserves the calendar day regardless of local tz", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2024, max: 2030 }),
        fc.integer({ min: 0, max: 11 }),
        fc.integer({ min: 1, max: 28 }),
        (y, m, d) => {
          const local = new Date(y, m, d);
          const stored = toDbDate(local); // what we persist to @db.Date
          const readBack = fromDbDate(stored); // what we read back
          expect(dateKey(readBack)).toBe(dateKey(local));
        },
      ),
      { numRuns: 100 },
    );
  });

  it("completedKeysFromRows builds calendar keys matching local occurrence keys", () => {
    const local = new Date(2026, 6, 20);
    const rows = [{ date: toDbDate(local) }];
    const keys = completedKeysFromRows(rows);
    expect(keys.has(dateKey(local))).toBe(true);
  });
});

describe("boundary cases", () => {
  it("treats the window as half-open at the Sunday/Monday boundary", () => {
    const rule: RecurrenceRule = {
      days: [1], // Mondays only
      interval: null,
      anchor: BASE,
      timeMinutes: null,
    };
    // window Sun Jul 19 00:00 → Mon Jul 20 00:00 excludes the Monday
    const out = generateOccurrences(
      rule,
      new Date(2026, 6, 19),
      new Date(2026, 6, 20),
    );
    expect(out).toEqual([]);
    // window that includes the Monday
    const out2 = generateOccurrences(
      rule,
      new Date(2026, 6, 19),
      new Date(2026, 6, 21),
    );
    expect(out2.map(dateKey)).toEqual(["2026-07-20"]);
  });

  it("returns [] when from == to", () => {
    const rule: RecurrenceRule = {
      days: [1, 2, 3, 4, 5, 6, 7],
      interval: null,
      anchor: BASE,
      timeMinutes: null,
    };
    expect(generateOccurrences(rule, BASE, BASE)).toEqual([]);
  });

  it("streak of 1 when the only occurrence is today and it is completed", () => {
    const rule: RecurrenceRule = {
      days: [],
      interval: 100,
      anchor: new Date(2026, 6, 20),
      timeMinutes: null,
    };
    const today = new Date(2026, 6, 20);
    const completed = new Set([dateKey(today)]);
    expect(computeStreak(rule, completed, today)).toBe(1);
  });
});
