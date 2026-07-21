import type { PlanningItem } from "@prisma/client";

/**
 * Pure helpers for the Notes view. A note is a `nota`-type `PlanningItem`; its
 * body is the `description` column and its section is its owning category. These
 * helpers are free of React and I/O so they are fully unit-testable; the notes
 * view is a thin renderer over them.
 */

/** A note enriched with its owning category (the section). */
export interface NoteWithCategory extends PlanningItem {
  categoryId: string;
  categoryName: string;
  categoryColor: string | null;
}

/** A section: a category and the notes that belong to it. */
export interface NoteSection {
  categoryId: string;
  categoryName: string;
  categoryColor: string | null;
  notes: NoteWithCategory[];
}

/**
 * Notes whose title contains `query` (case-insensitive, trimmed). An empty or
 * whitespace-only query returns all notes unchanged.
 */
export function filterNotesByTitle(
  notes: NoteWithCategory[],
  query: string,
): NoteWithCategory[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return notes;
  return notes.filter((note) => note.title.toLowerCase().includes(needle));
}

/**
 * Groups notes into sections by owning category, preserving each note's order
 * within its section and emitting sections in first-appearance order. Every
 * input note lands in exactly one section; the set of sections equals the set of
 * distinct categories present in the input.
 */
export function groupNotesByCategory(notes: NoteWithCategory[]): NoteSection[] {
  const sections: NoteSection[] = [];
  const byId = new Map<string, NoteSection>();
  for (const note of notes) {
    let section = byId.get(note.categoryId);
    if (!section) {
      section = {
        categoryId: note.categoryId,
        categoryName: note.categoryName,
        categoryColor: note.categoryColor,
        notes: [],
      };
      byId.set(note.categoryId, section);
      sections.push(section);
    }
    section.notes.push(note);
  }
  return sections;
}
