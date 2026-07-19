import { describe, expect, it } from "vitest";
import { createListSchema, updateListSchema } from "./list.schema";

describe("createListSchema", () => {
  it("accepts a payload with categoryId and name", () => {
    const result = createListSchema.safeParse({
      categoryId: "cat-1",
      name: "Groceries",
    });

    expect(result.success).toBe(true);
  });

  it("accepts an optional sortOrder", () => {
    const result = createListSchema.safeParse({
      categoryId: "cat-1",
      name: "Groceries",
      sortOrder: 3,
    });

    expect(result.success).toBe(true);
  });

  it("rejects a payload missing categoryId", () => {
    const result = createListSchema.safeParse({ name: "Groceries" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path[0] === "categoryId"),
      ).toBe(true);
    }
  });

  it("rejects a payload missing name", () => {
    const result = createListSchema.safeParse({ categoryId: "cat-1" });

    expect(result.success).toBe(false);
  });

  it("rejects a whitespace-only name", () => {
    const result = createListSchema.safeParse({
      categoryId: "cat-1",
      name: "   ",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a name longer than 100 characters", () => {
    const result = createListSchema.safeParse({
      categoryId: "cat-1",
      name: "a".repeat(101),
    });

    expect(result.success).toBe(false);
  });

  it("rejects a negative sortOrder", () => {
    const result = createListSchema.safeParse({
      categoryId: "cat-1",
      name: "Groceries",
      sortOrder: -1,
    });

    expect(result.success).toBe(false);
  });
});

describe("updateListSchema", () => {
  it("accepts an empty payload (no-op patch)", () => {
    const result = updateListSchema.safeParse({});

    expect(result.success).toBe(true);
  });

  it("accepts a name-only patch", () => {
    const result = updateListSchema.safeParse({ name: "Renamed" });

    expect(result.success).toBe(true);
  });

  it("rejects an empty-string name when present", () => {
    const result = updateListSchema.safeParse({ name: "" });

    expect(result.success).toBe(false);
  });
});
