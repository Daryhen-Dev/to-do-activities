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
