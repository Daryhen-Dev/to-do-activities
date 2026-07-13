import { describe, expect, it } from "vitest";
import { createPlanningItemSchema } from "./planning-item.schema";

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
});
