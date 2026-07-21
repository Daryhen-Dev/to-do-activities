# Design Document

## Overview

Add a dedicated **Notes view** at `/(app)/notes`. Notes are planning items whose
item type is `nota`; they carry a title and an optional body (`description`) and
have no schedule. A new **read** endpoint `GET /api/notes` returns the user's
live notes enriched with their owning category (the "section"), reusing the
existing `List → Category` join. The client renders them as a searchable
vertical **stack grouped by category section**. All writes reuse the existing
`/api/planning-items` endpoints — creating a note is just a `nota`-type item in a
chosen list; editing/deleting are the existing PATCH/DELETE.

Guiding decisions:

- **Reuse categories as sections.** A note lives in a `List` (mandatory
  hierarchy), and its section is that list's `Category`. No new grouping model,
  no schema change. Grouping and section headers are derived from the category.
- **No new write endpoints.** Create/edit/delete go through
  `POST/PATCH/DELETE /api/planning-items` with `itemTypeId` = the `nota` type.
  Only a read endpoint (`GET /api/notes`) and the pure grouping/search helpers
  are new.
- **Hard logic stays pure and unit-tested.** Title search and category grouping
  are pure functions in `src/lib/notes.ts`; the view is a thin renderer with
  local state + optimistic mutations (mirrors `TaskList`).
- **Identify notes by the type key.** The repository filters
  `itemType: { key: "nota" }`, so the view never depends on a hard-coded id.

## Architecture

```
sidebar "Notes" link → /(app)/notes/page.tsx (server: inherits (app) auth shell)
  └─ <NotesView/> (client)
       ├─ useWorkspaceStore.ensureLoaded() → categories + lists (section + create target)
       ├─ useItemTypeStore.ensureLoaded()  → the `nota` type id (create payload)
       ├─ fetch GET /api/notes → NoteWithCategory[]  (local state)
       ├─ search box → filterNotesByTitle(notes, query)      [pure]
       ├─ groupNotesByCategory(filtered)                     [pure] → sections
       ├─ sections: category header + stack of <NoteCard/>
       ├─ create/edit → <NoteFormDialog/> (title, body, list-in-category select)
       │     create → POST /api/planning-items { title, description, listId, itemTypeId: nota }
       │     edit   → PATCH /api/planning-items/[id] { title, description, listId }
       └─ delete   → DELETE /api/planning-items/[id]   (optimistic, revert on error)

GET /api/notes/route.ts (thin)
  → listNotesForCurrentUser()                 [service]
       → listNotesByUser(userId)              [repository: sole Prisma boundary]
             where itemType.key = "nota", live, joins List→Category
```

## Data Models

No schema changes. A note is an existing `PlanningItem` with `itemTypeId`
pointing at the `nota` item type; its body is the existing `description` column.
A new **read** projection is assembled in the repository from the `List →
Category` join:

```ts
/** A note enriched with its owning category (the section). */
export interface NoteWithCategory extends PlanningItem {
  categoryId: string;
  categoryName: string;
  categoryColor: string | null;
}
```

## Components and Interfaces

### Pure helpers — `src/lib/notes.ts` (new) — unit-tested

```ts
import type { PlanningItem } from "@prisma/client";

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
): NoteWithCategory[];

/**
 * Groups notes into sections by owning category, preserving each note's order
 * within its section and emitting sections in first-appearance order. Every
 * input note lands in exactly one section; sections cover exactly the present
 * categories.
 */
export function groupNotesByCategory(notes: NoteWithCategory[]): NoteSection[];
```

- `filterNotesByTitle` lower-cases the trimmed query and each title and matches
  by substring; empty query short-circuits to the input.
- `groupNotesByCategory` keeps the incoming order (the endpoint sorts newest
  first), so within a section notes stay newest-first and sections appear in the
  order their first note is encountered. Pure — no clock, no I/O.

### Presentational + container — `src/components/notes/notes-view.tsx` (new, client)

Mirrors `TaskList`'s shape (local state + optimistic mutations + error toasts):

- On mount: `ensureLoaded()` on the workspace store (categories + lists for the
  section select) and `ensureLoaded()` on the item-type store (to resolve the
  `nota` type id for the create payload). Fetch `GET /api/notes` into `notes`
  state.
- A search `Input` bound to a `query` state; `visible = filterNotesByTitle(notes,
  query)`; `sections = groupNotesByCategory(visible)`.
- Render each section: a header (category name + a small color swatch via
  `resolveCategoryColor`) and a vertical stack of `<NoteCard/>`.
- Empty states: no notes at all → neutral "no notes yet"; a non-empty search with
  no matches → neutral "no matches" (Req 1.5, 2.4).
- Create: a "New note" trigger opening `<NoteFormDialog mode="create"/>`; on
  submit `POST /api/planning-items` with `{ title, description, listId,
  itemTypeId: notaTypeId }`, then prepend the created note to state (Req 3.3). If
  the user has no lists, the create control is disabled with a hint (Req 3.5).
- Edit: each `NoteCard` opens `<NoteFormDialog mode="edit"/>`; on submit `PATCH
  /api/planning-items/[id]` with `{ title, description, listId }`, then replace
  the note in state (moving sections if the list changed).
- Delete: optimistic removal + `DELETE /api/planning-items/[id]`; restore on
  failure with an error toast (mirrors `TaskList.handleDelete`).

### `NoteCard` (`src/components/notes/note-card.tsx`, new)

Presentational card: title + a clamped body preview + edit/delete affordances.
Read-only rendering; interactions are delegated up via props.

### `NoteFormDialog` (`src/components/notes/note-form-dialog.tsx`, new)

A `FormSheet`-based create/edit form with: `title` (required), `description`
(textarea, optional) and a **section** select — a list picker grouped by
category (reusing the exact pattern from `TaskEditDialog`'s list `Select`, where
`SelectGroup`/`SelectLabel` = category and `SelectItem` = list). The chosen
`listId` determines the note's section. Validated with a small Zod schema
(`title` non-empty ≤ 500, `description` ≤ 2000). Resolves `true` on success so
the dialog closes.

### Route — `src/app/(app)/notes/page.tsx` (new)

Server component under the `(app)` route group (inherits the sidebar shell +
`auth()` guard). Renders `<NotesView/>` in a centered content column, consistent
with the list task page.

### Navigation — `src/components/layout/app-sidebar.tsx` (edited)

Add a top-level "Notes" link next to "Calendar" (a `SidebarMenuButton` with a
`StickyNote` icon linking to `/notes`, `isActive` when `pathname === "/notes"`),
in the same `SidebarGroup` that holds the Calendar link.

## Backend

### Repository — `src/repositories/planning-item.repository.ts` (edited)

New function (sole Prisma boundary), joined to the category and filtered to the
`nota` type by key:

```ts
export async function listNotesByUser(
  userId: string,
): Promise<NoteWithCategory[]>;
```

`where`: `userId`, `deletedAt: null`, `archived: false`,
`itemType: { key: "nota" }`, live `list` + `category: { userId, deletedAt: null
}`. `include` the `List → Category` select; flatten each row to
`NoteWithCategory` (Prisma relation shapes never leak). Order `updatedAt desc`.
Imports the `NoteWithCategory` type from `src/lib/notes.ts` (type-only).

### Service — `src/services/planning-item.service.ts` (edited)

```ts
export async function listNotesForCurrentUser(): Promise<NoteWithCategory[]>;
```

Resolves the acting user via `getCurrentUserId()` (authoritative ownership) and
delegates to `listNotesByUser`. No new create/update/delete service functions —
notes reuse `createPlanningItemForCurrentUser` / `updatePlanningItemForCurrentUser`
/ `deletePlanningItemForCurrentUser` through the existing routes.

### Route — `src/app/api/notes/route.ts` (new)

Thin `GET`: calls `listNotesForCurrentUser`, returns the array with 200. Reuse
the shared `mapErrorToResponse` contract (UnauthorizedError → 401, else 500). No
Prisma, no business logic.

## Error Handling

- **Unauthenticated** → `getCurrentUserId()` throws `UnauthorizedError` → `401`
  on `GET /api/notes` (Req 5.4).
- **Notes load failure** → non-blocking error toast; the view renders empty
  rather than crashing.
- **Create/edit/delete failure** → the existing `/api/planning-items` error
  bodies are surfaced via `toast.error`; optimistic changes are reverted (Req
  3.4, 4.5).
- **No lists to place a note** → the create control is disabled with a hint
  (Req 3.5); no request is made.

## Correctness Properties

### Property 1: Title search is exact and case-insensitive

`filterNotesByTitle(notes, query)` returns exactly the notes whose title contains
`query` ignoring case and surrounding whitespace; an empty/whitespace query
returns all notes unchanged.

**Validates: Requirements 2.1, 2.3**

### Property 2: Grouping is total and category-partitioned

`groupNotesByCategory(notes)` places every input note in exactly one section
keyed by its `categoryId` (no note dropped or duplicated), each section's notes
preserve their input order, and the set of sections equals the set of distinct
categories present in the input.

**Validates: Requirements 1.2, 1.3**

### Property 3: Notes query is user-scoped, type-filtered, and lifecycle-correct

`listNotesByUser(userId)` returns only items of `userId` whose item type is
`nota` and that are live (`deletedAt IS NULL`, `archived = false`), each carrying
its category id/name/color, ordered by `updatedAt` descending; non-`nota` items,
deleted/archived items, and other users' items are all excluded.

**Validates: Requirements 5.1, 5.2, 5.3, 5.5, 6.1**

## Testing Strategy

- **Pure helpers (primary coverage)** — `src/lib/notes.test.ts`:
  `filterNotesByTitle` (case-insensitive substring; trims; empty query → all; no
  match → empty); `groupNotesByCategory` (every note grouped once; order
  preserved within a section; sections cover exactly the present categories;
  empty input → empty).
- **Backend (layered)**:
  - Repository `listNotesByUser` — returns only `nota`-type live items with
    category id/name/color; excludes non-`nota` items, deleted, archived, and
    other users; ordered by `updatedAt desc`. Against the test DB with the stable
    seed and idempotent cleanup (create a `nota` item and a `tarea` item under a
    throwaway list; assert only the note comes back).
  - Service `listNotesForCurrentUser` — delegates with the resolved user.
  - Route `GET /api/notes` — 200 with the notes; 401 unauthenticated.
- **Interaction (manual smoke test)**: `/notes` shows notes stacked under
  category sections; searching by title filters and hides empty sections;
  creating a note adds it to its section; editing moves it if the section
  changed; deleting removes it; a task (non-note) never appears; the sidebar
  "Notes" link routes here.
- **Gates**: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test`, `pnpm build`
  green.

## Verification Checklist

- [ ] `/notes` lists live `nota` items stacked and grouped by category section.
- [ ] Title search filters case-insensitively and hides empty sections; clearing restores all.
- [ ] Create adds a note to its section; no phantom on failure.
- [ ] Edit updates in place (and moves sections when the list changes); delete removes optimistically with revert on error.
- [ ] `GET /api/notes` returns only owned, live `nota` items with category; 401 unauth; no non-`nota` items.
- [ ] Sidebar "Notes" entry routes to `/notes`.
- [ ] Categories are reused as sections; writes reuse `/api/planning-items`.
- [ ] Pure-helper + layered backend tests green; build/lint/tsc clean.

## Notes

- **Reuse over reinvention**: sections = categories; note writes = the existing
  planning-item endpoints; only a read endpoint + pure helpers + view are new.
- **Notes remain planning items**: they still appear in their list's task view
  (a note carries the `nota` type badge there) — intentionally not hidden.
- **Workflow**: commit to `main`, conventional commits, no AI attribution, keep
  the suite green (current repo convention) unless told otherwise.
