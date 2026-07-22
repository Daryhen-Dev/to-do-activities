import { describe, expect, it } from "vitest";
import { clampProgress, daysRemaining, objectiveStatus } from "./objectives";

/**
 * Unit tests for the pure objective helpers. Dates use the LOCAL constructor so
 * the day math is exercised deterministically regardless of timezone; `now` is
 * always injected.
 */

describe("daysRemaining", () => {
  const now = new Date(2026, 5, 15, 14, 0); // Jun 15, 2026 14:00 local

  it("returns null when there is no deadline", () => {
    expect(daysRemaining(null, now)).toBeNull();
  });

  it("returns 0 for a deadline later the same day (time-of-day ignored)", () => {
    expect(daysRemaining(new Date(2026, 5, 15, 23, 59), now)).toBe(0);
    expect(daysRemaining(new Date(2026, 5, 15, 0, 1), now)).toBe(0);
  });

  it("returns a positive count for a future deadline", () => {
    expect(daysRemaining(new Date(2026, 5, 16, 8, 0), now)).toBe(1);
    expect(daysRemaining(new Date(2026, 5, 22, 8, 0), now)).toBe(7);
  });

  it("returns a negative count for a past deadline", () => {
    expect(daysRemaining(new Date(2026, 5, 14, 23, 0), now)).toBe(-1);
    expect(daysRemaining(new Date(2026, 5, 10, 0, 0), now)).toBe(-5);
  });
});

describe("clampProgress", () => {
  it("clamps below 0 to 0", () => {
    expect(clampProgress(-5)).toBe(0);
  });

  it("clamps above 100 to 100", () => {
    expect(clampProgress(150)).toBe(100);
  });

  it("rounds an in-range value to the nearest integer", () => {
    expect(clampProgress(42.6)).toBe(43);
    expect(clampProgress(42.4)).toBe(42);
  });

  it("keeps the 0 and 100 boundaries", () => {
    expect(clampProgress(0)).toBe(0);
    expect(clampProgress(100)).toBe(100);
  });
});

describe("objectiveStatus", () => {
  const now = new Date(2026, 5, 15, 14, 0);

  it("is completed when progress is 100, even past the deadline", () => {
    expect(objectiveStatus(new Date(2026, 5, 1), 100, now)).toBe("completed");
  });

  it("is no-deadline when there is no end and progress < 100", () => {
    expect(objectiveStatus(null, 40, now)).toBe("no-deadline");
  });

  it("is overdue when the deadline has passed and progress < 100", () => {
    expect(objectiveStatus(new Date(2026, 5, 10), 50, now)).toBe("overdue");
  });

  it("is active when the deadline is ahead and progress < 100", () => {
    expect(objectiveStatus(new Date(2026, 5, 20), 50, now)).toBe("active");
  });

  it("treats null progress as 0", () => {
    expect(objectiveStatus(new Date(2026, 5, 10), null, now)).toBe("overdue");
    expect(objectiveStatus(null, null, now)).toBe("no-deadline");
  });
});
