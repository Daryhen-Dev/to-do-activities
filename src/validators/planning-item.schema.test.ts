import { describe, expect, it } from "vitest";
import {
  createPlanningItemSchema,
  updatePlanningItemSchema,
} from "./planning-item.schema";

describe("createPlanningItemSchema", () => {
  it("accepts a payload with only a title (quick capture)", () => {
    const result = createPlanningItemSchema.safeParse({ title: "Buy milk" });

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

  it("rejects a payload missing title", () => {
    const result = createPlanningItemSchema.safeParse({
      description: "no title here",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "title")).toBe(
        true,
      );
    }
  });

  it("rejects an empty-string title", () => {
    const result = createPlanningItemSchema.safeParse({ title: "" });

    expect(result.success).toBe(false);
  });

  it("rejects a whitespace-only title", () => {
    const result = createPlanningItemSchema.safeParse({ title: "   " });

    expect(result.success).toBe(false);
  });

  it("rejects a title longer than 500 characters", () => {
    const result = createPlanningItemSchema.safeParse({
      title: "a".repeat(501),
    });

    expect(result.success).toBe(false);
  });

  it("accepts a title exactly 500 characters long", () => {
    const result = createPlanningItemSchema.safeParse({
      title: "a".repeat(500),
    });

    expect(result.success).toBe(true);
  });

  it("ignores a userId field if present (not part of the schema)", () => {
    const result = createPlanningItemSchema.safeParse({
      title: "Buy milk",
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

  it("accepts an explicit null on nullable fields to clear them", () => {
    const result = updatePlanningItemSchema.safeParse({
      description: null,
      listId: null,
      priorityId: null,
      dueAt: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dueAt).toBeNull();
      expect(result.data.listId).toBeNull();
    }
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
