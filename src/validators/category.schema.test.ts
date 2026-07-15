import { describe, expect, it } from "vitest";
import { createCategorySchema, updateCategorySchema } from "./category.schema";

describe("createCategorySchema", () => {
  it("accepts a payload with only a name", () => {
    const result = createCategorySchema.safeParse({ name: "Work" });

    expect(result.success).toBe(true);
  });

  it("accepts a payload with every optional field set", () => {
    const result = createCategorySchema.safeParse({
      name: "Work",
      color: "#3B82F6",
      icon: "briefcase",
      sortOrder: 2,
    });

    expect(result.success).toBe(true);
  });

  it("rejects a payload missing name", () => {
    const result = createCategorySchema.safeParse({ color: "#3B82F6" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "name")).toBe(
        true,
      );
    }
  });

  it("rejects an empty-string name", () => {
    const result = createCategorySchema.safeParse({ name: "" });

    expect(result.success).toBe(false);
  });

  it("rejects a whitespace-only name", () => {
    const result = createCategorySchema.safeParse({ name: "   " });

    expect(result.success).toBe(false);
  });

  it("rejects a name longer than 100 characters", () => {
    const result = createCategorySchema.safeParse({ name: "a".repeat(101) });

    expect(result.success).toBe(false);
  });

  it("accepts a name exactly 100 characters long", () => {
    const result = createCategorySchema.safeParse({ name: "a".repeat(100) });

    expect(result.success).toBe(true);
  });

  it("rejects a negative sortOrder", () => {
    const result = createCategorySchema.safeParse({
      name: "Work",
      sortOrder: -1,
    });

    expect(result.success).toBe(false);
  });

  it("ignores a userId field if present (not part of the schema)", () => {
    const result = createCategorySchema.safeParse({
      name: "Work",
      userId: "someone-elses-id",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).userId).toBeUndefined();
    }
  });
});

describe("updateCategorySchema", () => {
  it("accepts an empty payload (no-op update)", () => {
    const result = updateCategorySchema.safeParse({});

    expect(result.success).toBe(true);
  });

  it("accepts a payload with only sortOrder", () => {
    const result = updateCategorySchema.safeParse({ sortOrder: 3 });

    expect(result.success).toBe(true);
  });

  it("rejects an empty-string name when name is provided", () => {
    const result = updateCategorySchema.safeParse({ name: "" });

    expect(result.success).toBe(false);
  });
});
