import { beforeEach, describe, expect, it } from "vitest";
import { useCalendarStore } from "./calendar-store";

/**
 * Unit tests for the calendar view Zustand store.
 *
 * The store is a module-level singleton, so each test resets it in beforeEach
 * to a deterministic anchor (June 2026) and the default "month" view. State and
 * actions are accessed outside React via getState().
 *
 * The anchor is normalized to the 1st of the month on every shift (shiftMonth
 * builds `new Date(year, month + n, 1)`), so month navigation tests also assert
 * getDate() === 1. goToToday uses `new Date()` and is NOT normalized, so it is
 * asserted against the current month/year only.
 *
 * Covers Requirement 4.1 (view toggle) and Requirement 4.3 (month navigation
 * with year rollover and reset to today).
 */

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
});

describe("month navigation", () => {
  it("goToNextMonth advances to the next month (June 2026 -> July 2026)", () => {
    useCalendarStore.getState().goToNextMonth();

    const { anchorDate } = useCalendarStore.getState();
    expect(anchorDate.getMonth()).toBe(6); // July (0-indexed)
    expect(anchorDate.getFullYear()).toBe(2026);
    // Normalized to the 1st on every shift.
    expect(anchorDate.getDate()).toBe(1);
  });

  it("goToPrevMonth moves to the previous month (June 2026 -> May 2026)", () => {
    useCalendarStore.getState().goToPrevMonth();

    const { anchorDate } = useCalendarStore.getState();
    expect(anchorDate.getMonth()).toBe(4); // May (0-indexed)
    expect(anchorDate.getFullYear()).toBe(2026);
    expect(anchorDate.getDate()).toBe(1);
  });

  it("goToNextMonth rolls over the year (December 2026 -> January 2027)", () => {
    useCalendarStore.setState({ anchorDate: new Date(2026, 11, 10) }); // Dec 2026

    useCalendarStore.getState().goToNextMonth();

    const { anchorDate } = useCalendarStore.getState();
    expect(anchorDate.getMonth()).toBe(0); // January
    expect(anchorDate.getFullYear()).toBe(2027);
    expect(anchorDate.getDate()).toBe(1);
  });

  it("goToPrevMonth rolls back the year (January 2026 -> December 2025)", () => {
    useCalendarStore.setState({ anchorDate: new Date(2026, 0, 10) }); // Jan 2026

    useCalendarStore.getState().goToPrevMonth();

    const { anchorDate } = useCalendarStore.getState();
    expect(anchorDate.getMonth()).toBe(11); // December
    expect(anchorDate.getFullYear()).toBe(2025);
    expect(anchorDate.getDate()).toBe(1);
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
