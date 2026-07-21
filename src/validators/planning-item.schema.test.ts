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
});
