import { beforeEach, describe, expect, it } from "vitest";
import { useCalendarStore } from "./calendar-store";

/**
 * Unit tests for the calendar view Zustand store.
 *
 * The store is a module-level singleton, so each test resets it in beforeEach
 * to a deterministic anchor (June 2026) and the default "month" view. State and
 * actions are accessed outside React via getState().
 *
 * Navigation is view-aware: goToPrev/goToNext shift the anchor by the active
 * view's unit — month view → ±1 month (normalized to the 1st), week/agenda view
 * → ±7 days, day view → ±1 day. Month navigation therefore asserts
 * getDate() === 1, while week/day navigation asserts the exact day delta and a
 * preserved weekday. goToToday uses `new Date()` and is NOT normalized, so it is
 * asserted against the current month/year only.
 *
 * Covers Requirement 4.1 (view toggle), Requirement 4.2 (week/day navigation),
 * and Requirement 4.3 (month navigation with year rollover and reset to today).
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  useCalendarStore.setState({
    view: "month",
    anchorDate: new Date(2026, 5, 15), // June 15, 2026
  });
});

describe("setView", () => {
  it("switches the view from month to agenda and back", () => {
    expect(useCalendarStore.getState().view).toBe("month");

    useCalendarStore.getState().setView("agenda");
    expect(useCalendarStore.getState().view).toBe("agenda");

    useCalendarStore.getState().setView("month");
    expect(useCalendarStore.getState().view).toBe("month");
  });

  it("switches to week and day views", () => {
    useCalendarStore.getState().setView("week");
    expect(useCalendarStore.getState().view).toBe("week");

    useCalendarStore.getState().setView("day");
    expect(useCalendarStore.getState().view).toBe("day");
  });
});

describe("month view navigation", () => {
  it("goToNext advances to the next month (June 2026 -> July 2026)", () => {
    useCalendarStore.getState().goToNext();

    const { anchorDate } = useCalendarStore.getState();
    expect(anchorDate.getMonth()).toBe(6); // July (0-indexed)
    expect(anchorDate.getFullYear()).toBe(2026);
    // Normalized to the 1st on every month shift.
    expect(anchorDate.getDate()).toBe(1);
  });

  it("goToPrev moves to the previous month (June 2026 -> May 2026)", () => {
    useCalendarStore.getState().goToPrev();

    const { anchorDate } = useCalendarStore.getState();
    expect(anchorDate.getMonth()).toBe(4); // May (0-indexed)
    expect(anchorDate.getFullYear()).toBe(2026);
    expect(anchorDate.getDate()).toBe(1);
  });

  it("goToNext rolls over the year (December 2026 -> January 2027)", () => {
    useCalendarStore.setState({ anchorDate: new Date(2026, 11, 10) }); // Dec 2026

    useCalendarStore.getState().goToNext();

    const { anchorDate } = useCalendarStore.getState();
    expect(anchorDate.getMonth()).toBe(0); // January
    expect(anchorDate.getFullYear()).toBe(2027);
    expect(anchorDate.getDate()).toBe(1);
  });

  it("goToPrev rolls back the year (January 2026 -> December 2025)", () => {
    useCalendarStore.setState({ anchorDate: new Date(2026, 0, 10) }); // Jan 2026

    useCalendarStore.getState().goToPrev();

    const { anchorDate } = useCalendarStore.getState();
    expect(anchorDate.getMonth()).toBe(11); // December
    expect(anchorDate.getFullYear()).toBe(2025);
    expect(anchorDate.getDate()).toBe(1);
  });
});

describe("week view navigation", () => {
  it("goToNext advances the anchor by exactly 7 days, preserving the weekday", () => {
    const start = new Date(2026, 5, 15); // June 15, 2026
    useCalendarStore.setState({ view: "week", anchorDate: start });

    useCalendarStore.getState().goToNext();

    const { anchorDate } = useCalendarStore.getState();
    expect(anchorDate.getTime() - start.getTime()).toBe(7 * MS_PER_DAY);
    expect(anchorDate.getDate()).toBe(22); // June 22
    expect(anchorDate.getMonth()).toBe(5);
    expect(anchorDate.getDay()).toBe(start.getDay()); // same weekday
  });

  it("goToPrev moves the anchor back by exactly 7 days, preserving the weekday", () => {
    const start = new Date(2026, 5, 15); // June 15, 2026
    useCalendarStore.setState({ view: "week", anchorDate: start });

    useCalendarStore.getState().goToPrev();

    const { anchorDate } = useCalendarStore.getState();
    expect(start.getTime() - anchorDate.getTime()).toBe(7 * MS_PER_DAY);
    expect(anchorDate.getDate()).toBe(8); // June 8
    expect(anchorDate.getMonth()).toBe(5);
    expect(anchorDate.getDay()).toBe(start.getDay()); // same weekday
  });

  it("goToNext crosses a month boundary (2026-05-28 -> 2026-06-04)", () => {
    const start = new Date(2026, 4, 28); // May 28, 2026
    useCalendarStore.setState({ view: "week", anchorDate: start });

    useCalendarStore.getState().goToNext();

    const { anchorDate } = useCalendarStore.getState();
    expect(anchorDate.getTime() - start.getTime()).toBe(7 * MS_PER_DAY);
    expect(anchorDate.getMonth()).toBe(5); // June
    expect(anchorDate.getDate()).toBe(4); // June 4
    expect(anchorDate.getDay()).toBe(start.getDay()); // same weekday
  });
});

describe("day view navigation", () => {
  it("goToNext advances the anchor by exactly 1 day", () => {
    const start = new Date(2026, 5, 15); // June 15, 2026
    useCalendarStore.setState({ view: "day", anchorDate: start });

    useCalendarStore.getState().goToNext();

    const { anchorDate } = useCalendarStore.getState();
    expect(anchorDate.getTime() - start.getTime()).toBe(MS_PER_DAY);
    expect(anchorDate.getDate()).toBe(16); // June 16
    expect(anchorDate.getMonth()).toBe(5);
  });

  it("goToPrev moves the anchor back by exactly 1 day", () => {
    const start = new Date(2026, 5, 15); // June 15, 2026
    useCalendarStore.setState({ view: "day", anchorDate: start });

    useCalendarStore.getState().goToPrev();

    const { anchorDate } = useCalendarStore.getState();
    expect(start.getTime() - anchorDate.getTime()).toBe(MS_PER_DAY);
    expect(anchorDate.getDate()).toBe(14); // June 14
    expect(anchorDate.getMonth()).toBe(5);
  });

  it("goToNext crosses a month boundary (2026-05-31 -> 2026-06-01)", () => {
    const start = new Date(2026, 4, 31); // May 31, 2026
    useCalendarStore.setState({ view: "day", anchorDate: start });

    useCalendarStore.getState().goToNext();

    const { anchorDate } = useCalendarStore.getState();
    expect(anchorDate.getMonth()).toBe(5); // June
    expect(anchorDate.getDate()).toBe(1); // June 1
    expect(anchorDate.getFullYear()).toBe(2026);
  });

  it("goToNext crosses a year boundary (2026-12-31 -> 2027-01-01)", () => {
    const start = new Date(2026, 11, 31); // Dec 31, 2026
    useCalendarStore.setState({ view: "day", anchorDate: start });

    useCalendarStore.getState().goToNext();

    const { anchorDate } = useCalendarStore.getState();
    expect(anchorDate.getFullYear()).toBe(2027);
    expect(anchorDate.getMonth()).toBe(0); // January
    expect(anchorDate.getDate()).toBe(1); // January 1
  });
});

describe("goToToday", () => {
  it("resets the anchor to the current month and year", () => {
    // Start away from today to prove the reset actually moves the anchor.
    useCalendarStore.setState({ anchorDate: new Date(2020, 0, 1) });

    useCalendarStore.getState().goToToday();

    const now = new Date();
    const { anchorDate } = useCalendarStore.getState();
    expect(anchorDate.getMonth()).toBe(now.getMonth());
    expect(anchorDate.getFullYear()).toBe(now.getFullYear());
  });
});
