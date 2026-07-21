import { describe, expect, it } from "vitest";
import {
  CATEGORY_COLOR_PALETTE,
  resolveCategoryColor,
} from "./category-color";

/**
 * Unit tests for the pure category-color resolver. The resolver must be
 * deterministic: a given id always maps to the same palette color, so the
 * combined calendar renders each category consistently across reloads.
 */

const palette = new Set<string>(CATEGORY_COLOR_PALETTE);

describe("resolveCategoryColor", () => {
  it("returns the given color when it is a non-empty string", () => {
    expect(resolveCategoryColor("#123456", "cat-1")).toBe("#123456");
    expect(resolveCategoryColor("rebeccapurple", "cat-2")).toBe("rebeccapurple");
  });

  it("returns a palette color when color is null", () => {
    const color = resolveCategoryColor(null, "cat-1");
    expect(palette.has(color)).toBe(true);
  });

  it("returns a palette color when color is the empty string", () => {
    const color = resolveCategoryColor("", "cat-1");
    expect(palette.has(color)).toBe(true);
  });

  it("returns a palette color when color is only whitespace", () => {
    const color = resolveCategoryColor("   ", "cat-1");
    expect(palette.has(color)).toBe(true);
  });

  it("is deterministic: the same id yields the same color across calls", () => {
    const first = resolveCategoryColor(null, "category-abc");
    const second = resolveCategoryColor(null, "category-abc");
    const third = resolveCategoryColor("", "category-abc");
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it("spreads different ids across at least two distinct palette colors", () => {
    const ids = [
      "cat-1",
      "cat-2",
      "cat-3",
      "cat-4",
      "cat-5",
      "cat-6",
      "cat-7",
      "cat-8",
    ];
    const colors = new Set(ids.map((id) => resolveCategoryColor(null, id)));
    expect(colors.size).toBeGreaterThanOrEqual(2);
    // Every derived color must come from the palette.
    for (const color of colors) {
      expect(palette.has(color)).toBe(true);
    }
  });
});

describe("CATEGORY_COLOR_PALETTE", () => {
  it("is non-empty and contains only unique hex colors", () => {
    expect(CATEGORY_COLOR_PALETTE.length).toBeGreaterThan(0);
    expect(new Set(CATEGORY_COLOR_PALETTE).size).toBe(
      CATEGORY_COLOR_PALETTE.length,
    );
    for (const color of CATEGORY_COLOR_PALETTE) {
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});
