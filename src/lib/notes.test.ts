import { describe, expect, it } from "vitest";
import {
  filterNotesByTitle,
  groupNotesByCategory,
  type NoteWithCategory,
} from "./notes";

/**
 * Builds a NoteWithCategory-shaped row for the pure helpers. Casts a partial
 * object since a full PlanningItem has many unrelated fields not exercised here.
 */
function makeNote(row: {
  id: string;
  title: string;
  categoryId: string;
  categoryName?: string;
  categoryColor?: string | null;
}): NoteWithCategory {
  return {
    id: row.id,
    title: row.title,
    description: null,
    categoryId: row.categoryId,
    categoryName: row.categoryName ?? row.categoryId,
    categoryColor: row.categoryColor ?? null,
  } as unknown as NoteWithCategory;
}

describe("filterNotesByTitle", () => {
  const notes = [
    makeNote({ id: "1", title: "Groceries", categoryId: "c" }),
    makeNote({ id: "2", title: "Business ideas", categoryId: "c" }),
    makeNote({ id: "3", title: "Meeting notes", categoryId: "c" }),
  ];

  it("returns all notes for an empty query", () => {
    expect(filterNotesByTitle(notes, "")).toEqual(notes);
  });

  it("returns all notes for a whitespace-only query", () => {
    expect(filterNotesByTitle(notes, "   ")).toEqual(notes);
  });

  it("matches case-insensitively on a substring", () => {
    expect(filterNotesByTitle(notes, "BUSINESS").map((n) => n.id)).toEqual([
      "2",
    ]);
    expect(filterNotesByTitle(notes, "notes").map((n) => n.id)).toEqual(["3"]);
  });

  it("trims the query before matching", () => {
    expect(filterNotesByTitle(notes, "  groceries  ").map((n) => n.id)).toEqual(
      ["1"],
    );
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterNotesByTitle(notes, "xyz")).toEqual([]);
  });
});

describe("groupNotesByCategory", () => {
  it("groups notes by category, preserving order within and across sections", () => {
    const notes = [
      makeNote({ id: "1", title: "A", categoryId: "work", categoryName: "Work" }),
      makeNote({ id: "2", title: "B", categoryId: "home", categoryName: "Home" }),
      makeNote({ id: "3", title: "C", categoryId: "work", categoryName: "Work" }),
    ];

    const sections = groupNotesByCategory(notes);

    // Sections appear in first-appearance order: work, then home.
    expect(sections.map((s) => s.categoryId)).toEqual(["work", "home"]);
    // Notes preserve their input order within a section.
    expect(sections[0].notes.map((n) => n.id)).toEqual(["1", "3"]);
    expect(sections[1].notes.map((n) => n.id)).toEqual(["2"]);
  });

  it("places every note in exactly one section (no loss, no duplication)", () => {
    const notes = [
      makeNote({ id: "1", title: "A", categoryId: "x" }),
      makeNote({ id: "2", title: "B", categoryId: "y" }),
      makeNote({ id: "3", title: "C", categoryId: "x" }),
    ];

    const sections = groupNotesByCategory(notes);
    const total = sections.reduce((sum, s) => sum + s.notes.length, 0);

    expect(total).toBe(3);
    expect(sections).toHaveLength(2);
  });

  it("carries the category name and color onto the section", () => {
    const notes = [
      makeNote({
        id: "1",
        title: "A",
        categoryId: "work",
        categoryName: "Work",
        categoryColor: "#123456",
      }),
    ];

    const [section] = groupNotesByCategory(notes);
    expect(section.categoryName).toBe("Work");
    expect(section.categoryColor).toBe("#123456");
  });

  it("returns an empty array for no notes", () => {
    expect(groupNotesByCategory([])).toEqual([]);
  });
});
