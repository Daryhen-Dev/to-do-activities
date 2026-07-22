import { describe, expect, it } from "vitest";
import {
  createPlanningItemSchema,
  updatePlanningItemSchema,
} from "./planning-item.schema";

describe("createPlanningItemSchema", () => {
  it("accepts a minimal payload with a title and a listId", () => {
    const result = createPlanningItemSchema.safeParse({
      title: "Buy milk",
      listId: "list-1",
    });

    expect(result.success).toBe(true);
  });

  it("accepts a payload with every optional field set", () => {
    const result = createPlanningItemSchema.safeParse({
      title: "Buy milk",
      description: "2% milk, one gallon",
      listId: "list-1",
      itemTypeId: "item-type-1",
      priorityId: "priority-1",
      statusId: "status-1",
    });

    expect(result.success).toBe(true);
  });

  // Requirement 1.1: a task cannot be created without a list.
  it("rejects a payload missing listId", () => {
    const result = createPlanningItemSchema.safeParse({ title: "Buy milk" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path[0] === "listId"),
      ).toBe(true);
    }
  });

  // Requirement 1.1: an empty-string listId is not a valid list reference.
  it("rejects an empty-string listId", () => {
    const result = createPlanningItemSchema.safeParse({
      title: "Buy milk",
      listId: "",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path[0] === "listId"),
      ).toBe(true);
    }
  });

  it("rejects a payload missing title", () => {
    const result = createPlanningItemSchema.safeParse({
      description: "no title here",
      listId: "list-1",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "title")).toBe(
        true,
      );
    }
  });

  it("rejects an empty-string title", () => {
    const result = createPlanningItemSchema.safeParse({
      title: "",
      listId: "list-1",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a whitespace-only title", () => {
    const result = createPlanningItemSchema.safeParse({
      title: "   ",
      listId: "list-1",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a title longer than 500 characters", () => {
    const result = createPlanningItemSchema.safeParse({
      title: "a".repeat(501),
      listId: "list-1",
    });

    expect(result.success).toBe(false);
  });

  it("accepts a title exactly 500 characters long", () => {
    const result = createPlanningItemSchema.safeParse({
      title: "a".repeat(500),
      listId: "list-1",
    });

    expect(result.success).toBe(true);
  });

  it("ignores a userId field if present (not part of the schema)", () => {
    const result = createPlanningItemSchema.safeParse({
      title: "Buy milk",
      listId: "list-1",
      userId: "someone-elses-id",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).userId).toBeUndefined();
    }
  });

  it("coerces an ISO datetime string in dueAt to a Date", () => {
    const result = createPlanningItemSchema.safeParse({
      title: "Buy milk",
      listId: "list-1",
      dueAt: "2026-08-01T10:00:00.000Z",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dueAt).toBeInstanceOf(Date);
    }
  });

  it("rejects an unparseable dueAt value", () => {
    const result = createPlanningItemSchema.safeParse({
      title: "Buy milk",
      listId: "list-1",
      dueAt: "not-a-date",
    });

    expect(result.success).toBe(false);
  });

  // Reminder: an ISO datetime coerces to a Date.
  it("coerces an ISO datetime string in remindAt to a Date", () => {
    const result = createPlanningItemSchema.safeParse({
      title: "Take pills",
      listId: "list-1",
      remindAt: "2026-08-01T09:00:00.000Z",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.remindAt).toBeInstanceOf(Date);
    }
  });

  // Objective fields: accepted with a consistent timeframe and valid progress.
  it("accepts objective fields with a consistent timeframe and valid progress", () => {
    const result = createPlanningItemSchema.safeParse({
      title: "Ship v2",
      listId: "list-1",
      objectiveStartAt: "2026-08-01T00:00:00.000Z",
      objectiveEndAt: "2026-09-01T00:00:00.000Z",
      progress: 25,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.objectiveStartAt).toBeInstanceOf(Date);
      expect(result.data.objectiveEndAt).toBeInstanceOf(Date);
      expect(result.data.progress).toBe(25);
    }
  });

  it("rejects an objectiveEndAt earlier than objectiveStartAt", () => {
    const result = createPlanningItemSchema.safeParse({
      title: "Bad objective",
      listId: "list-1",
      objectiveStartAt: "2026-09-01T00:00:00.000Z",
      objectiveEndAt: "2026-08-01T00:00:00.000Z",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some(
          (issue) => issue.path[0] === "objectiveEndAt",
        ),
      ).toBe(true);
    }
  });

  it("rejects progress outside 0–100", () => {
    expect(
      createPlanningItemSchema.safeParse({
        title: "x",
        listId: "list-1",
        progress: 150,
      }).success,
    ).toBe(false);
    expect(
      createPlanningItemSchema.safeParse({
        title: "x",
        listId: "list-1",
        progress: -1,
      }).success,
    ).toBe(false);
  });

  // Requirement 2.1: a point-in-time schedule (a start with no end) is valid.
  it("accepts a point schedule with startAt and no endAt", () => {
    const result = createPlanningItemSchema.safeParse({
      title: "Standup",
      listId: "list-1",
      startAt: "2026-08-01T10:00:00.000Z",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.startAt).toBeInstanceOf(Date);
      expect(result.data.endAt).toBeUndefined();
    }
  });

  // Requirement 2.2: a ranged schedule is valid when endAt is on/after startAt.
  it("accepts startAt and endAt when endAt is on or after startAt", () => {
    const result = createPlanningItemSchema.safeParse({
      title: "Meeting",
      listId: "list-1",
      startAt: "2026-08-01T10:00:00.000Z",
      endAt: "2026-08-01T11:00:00.000Z",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.startAt).toBeInstanceOf(Date);
      expect(result.data.endAt).toBeInstanceOf(Date);
    }
  });

  // Requirement 2.3: an all-day schedule is flagged with allDay.
  it("accepts allDay set to true", () => {
    const result = createPlanningItemSchema.safeParse({
      title: "Holiday",
      listId: "list-1",
      startAt: "2026-08-01T00:00:00.000Z",
      allDay: true,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.allDay).toBe(true);
    }
  });

  // Requirement 2.1: an end without a start is not a valid schedule.
  it("rejects endAt without startAt", () => {
    const result = createPlanningItemSchema.safeParse({
      title: "Meeting",
      listId: "list-1",
      endAt: "2026-08-01T11:00:00.000Z",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path[0] === "endAt"),
      ).toBe(true);
    }
  });

  // Requirement 2.2: an end that precedes the start is inconsistent.
  it("rejects endAt earlier than startAt", () => {
    const result = createPlanningItemSchema.safeParse({
      title: "Meeting",
      listId: "list-1",
      startAt: "2026-08-01T11:00:00.000Z",
      endAt: "2026-08-01T10:00:00.000Z",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path[0] === "endAt"),
      ).toBe(true);
    }
  });
});

describe("updatePlanningItemSchema", () => {
  it("accepts an empty payload (no-op patch)", () => {
    const result = updatePlanningItemSchema.safeParse({});

    expect(result.success).toBe(true);
  });

  it("accepts a partial payload with a single field", () => {
    const result = updatePlanningItemSchema.safeParse({ title: "Renamed" });

    expect(result.success).toBe(true);
  });

  it("accepts a listId to move a task to another list", () => {
    const result = updatePlanningItemSchema.safeParse({ listId: "list-2" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.listId).toBe("list-2");
    }
  });

  it("accepts an explicit null on nullable fields to clear them", () => {
    const result = updatePlanningItemSchema.safeParse({
      description: null,
      priorityId: null,
      dueAt: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dueAt).toBeNull();
      expect(result.data.description).toBeNull();
    }
  });

  // Requirement 5.2: a task can never be detached from all lists, so the
  // update contract must reject an explicit null listId.
  it("rejects a null listId (a task cannot be detached from its list)", () => {
    const result = updatePlanningItemSchema.safeParse({ listId: null });

    expect(result.success).toBe(false);
  });

  it("accepts an archived boolean toggle", () => {
    const result = updatePlanningItemSchema.safeParse({ archived: true });

    expect(result.success).toBe(true);
  });

  it("rejects a null on a required column (statusId)", () => {
    const result = updatePlanningItemSchema.safeParse({ statusId: null });

    expect(result.success).toBe(false);
  });

  it("rejects an empty-string title when present", () => {
    const result = updatePlanningItemSchema.safeParse({ title: "" });

    expect(result.success).toBe(false);
  });

  // Requirement 2.1/2.2: a partial patch can clear the schedule with explicit
  // null; the schema stays permissive because the service validates the
  // EFFECTIVE (merged) schedule.
  it("accepts an explicit null for startAt and endAt to clear the schedule", () => {
    const result = updatePlanningItemSchema.safeParse({
      startAt: null,
      endAt: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.startAt).toBeNull();
      expect(result.data.endAt).toBeNull();
    }
  });

  it("accepts changing startAt to a new value", () => {
    const result = updatePlanningItemSchema.safeParse({
      startAt: "2026-09-01T09:00:00.000Z",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.startAt).toBeInstanceOf(Date);
    }
  });

  // Reminder: coerces an ISO datetime to a Date on update.
  it("coerces an ISO datetime string in remindAt to a Date", () => {
    const result = updatePlanningItemSchema.safeParse({
      remindAt: "2026-09-01T09:00:00.000Z",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.remindAt).toBeInstanceOf(Date);
    }
  });

  // Reminder is clearable via an explicit null (like dueAt).
  it("accepts an explicit null for remindAt to clear it", () => {
    const result = updatePlanningItemSchema.safeParse({ remindAt: null });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.remindAt).toBeNull();
    }
  });

  // Requirement 4.5: acknowledgement is not client-writable through the general
  // update surface — reminderSeenAt is stripped (not part of the schema).
  it("strips reminderSeenAt (never client-writable via the general update)", () => {
    const result = updatePlanningItemSchema.safeParse({
      reminderSeenAt: "2026-09-01T09:00:00.000Z",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(
        (result.data as Record<string, unknown>).reminderSeenAt,
      ).toBeUndefined();
    }
  });

  // Objective fields are clearable via explicit null on update.
  it("accepts explicit null for objective timeframe fields to clear them", () => {
    const result = updatePlanningItemSchema.safeParse({
      objectiveStartAt: null,
      objectiveEndAt: null,
      progress: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.objectiveStartAt).toBeNull();
      expect(result.data.objectiveEndAt).toBeNull();
      expect(result.data.progress).toBeNull();
    }
  });

  it("rejects progress outside 0–100 on update", () => {
    expect(updatePlanningItemSchema.safeParse({ progress: 200 }).success).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// Recurrence fields (item type `habito`) — field-level validation.
// Property-based rejection classes + acceptance. The cross-field "at least one
// weekday OR an interval" rule and habit title/description bounds live in the
// service (validated against the effective rule), not here.
// ---------------------------------------------------------------------------

import fc from "fast-check";
import { habitCompletionSchema } from "./planning-item.schema";

describe("recurrence fields on createPlanningItemSchema", () => {
  const base = { title: "Meditate", listId: "list-1" };

  it("accepts a valid weekday-only recurrence rule", () => {
    const result = createPlanningItemSchema.safeParse({
      ...base,
      recurrenceDays: [1, 3, 5],
      recurrenceTimeMinutes: 480,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid interval-only recurrence rule", () => {
    const result = createPlanningItemSchema.safeParse({
      ...base,
      recurrenceDays: [],
      recurrenceInterval: 3,
      recurrenceTimeMinutes: 0,
      recurrenceAnchor: "2026-07-20",
    });
    expect(result.success).toBe(true);
  });

  // Property 2 (acceptance half): any field-valid rule parses.
  it("accepts any field-valid recurrence rule", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 7 }), { maxLength: 7 }),
        fc.option(fc.integer({ min: 1, max: 365 }), { nil: undefined }),
        fc.integer({ min: 0, max: 1439 }),
        (days, interval, time) => {
          const result = createPlanningItemSchema.safeParse({
            ...base,
            recurrenceDays: days,
            ...(interval !== undefined ? { recurrenceInterval: interval } : {}),
            recurrenceTimeMinutes: time,
          });
          expect(result.success).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property 4: invalid weekday sets are rejected.
  it("rejects weekday values outside 1..7, duplicates, or more than 7 entries", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // out-of-range value
          fc.array(fc.integer({ min: 8, max: 20 }), { minLength: 1, maxLength: 3 }),
          fc.array(fc.integer({ min: -5, max: 0 }), { minLength: 1, maxLength: 3 }),
          // duplicates
          fc.constant([1, 1]),
          fc.constant([2, 3, 3]),
          // more than 7 entries
          fc.constant([1, 2, 3, 4, 5, 6, 7, 1]),
        ),
        (days) => {
          const result = createPlanningItemSchema.safeParse({
            ...base,
            recurrenceDays: days,
          });
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property 5: out-of-range intervals are rejected.
  it("rejects non-integer or out-of-range intervals", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer({ min: -100, max: 0 }),
          fc.integer({ min: 366, max: 5000 }),
          fc.double({ min: 1.1, max: 364.9, noNaN: true }).filter((n) => !Number.isInteger(n)),
        ),
        (interval) => {
          const result = createPlanningItemSchema.safeParse({
            ...base,
            recurrenceInterval: interval,
          });
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property 6: out-of-range times-of-day are rejected.
  it("rejects times-of-day outside 0..1439 minutes", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer({ min: -1000, max: -1 }),
          fc.integer({ min: 1440, max: 100000 }),
        ),
        (time) => {
          const result = createPlanningItemSchema.safeParse({
            ...base,
            recurrenceTimeMinutes: time,
          });
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("recurrence fields on updatePlanningItemSchema", () => {
  it("accepts clearing interval/time/anchor with null and clearing days with []", () => {
    const result = updatePlanningItemSchema.safeParse({
      recurrenceDays: [],
      recurrenceInterval: null,
      recurrenceTimeMinutes: null,
      recurrenceAnchor: null,
    });
    expect(result.success).toBe(true);
  });

  it("still enforces field ranges on update", () => {
    const result = updatePlanningItemSchema.safeParse({
      recurrenceInterval: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("habitCompletionSchema", () => {
  it("accepts a YYYY-MM-DD date", () => {
    expect(habitCompletionSchema.safeParse({ date: "2026-07-20" }).success).toBe(
      true,
    );
  });

  it("rejects a malformed date", () => {
    for (const date of ["2026-7-20", "20-07-2026", "not-a-date", "2026/07/20", ""]) {
      expect(habitCompletionSchema.safeParse({ date }).success).toBe(false);
    }
  });

  it("rejects a missing date", () => {
    expect(habitCompletionSchema.safeParse({}).success).toBe(false);
  });
});
