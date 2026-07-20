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
});
