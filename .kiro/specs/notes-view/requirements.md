# Requirements Document

## Introduction

Notes (`itemType` key `nota`) can already be created like any planning item, but
there is no place to read or organize them: they only surface inside their list's
task view, mixed with tasks. Notes have no time semantics — they should not live
on the calendar.

This change adds a dedicated **Notes view** (`/(app)/notes`): a searchable,
vertical **stack** of the user's notes, grouped into **sections** by their owning
**category** (reusing the existing `Category → List` hierarchy — no new grouping
concept). The user can search notes by title, and create, edit, and delete notes
from this view. Writes reuse the existing `/api/planning-items` endpoints; only a
read endpoint and the view are new.

Scope for this version:

- A new route `/(app)/notes` and a "Notes" entry in the sidebar navigation.
- A read endpoint `GET /api/notes` returning the user's `nota`-type items, each
  carrying its owning `categoryId`/`categoryName` (and color) for the section.
- A stack of note cards (title + body preview), grouped by category section,
  newest first within each section.
- Title search (case-insensitive) that filters the visible notes.
- Create / edit / delete a note (title, body, and section = its list within a
  category), reusing `POST/PATCH/DELETE /api/planning-items`.
- Sections reuse categories; a note is placed in a **list** (its section is that
  list's category), exactly like every other planning item.

Out of scope for this version:

- Rich-text / markdown bodies, attachments, tags, pinning, reordering.
- Searching the note **body** (title search only this version).
- Hiding notes from their list's task view (a note is still a planning item and
  remains visible there).
- Any time/calendar behavior for notes.

## Glossary

- **Note**: A planning item whose item type is `nota`. Has a title and an
  optional body (`description`); no schedule.
- **Note body**: The note's `description` text.
- **Section**: A group of notes sharing an owning **category**. Sections reuse
  the existing categories — there is no separate "notes section" concept.
- **Notes view**: The `/(app)/notes` page showing the stack of notes by section.
- **Note stack**: Notes rendered vertically (one below another), newest first
  within a section.

## Requirements

### Requirement 1: See notes as a stack grouped by section

**User Story:** As a user, I want to see all my notes in one place, stacked and
grouped by section, so that they are not lost among my tasks.

#### Acceptance Criteria

1. WHEN a user opens `/notes` THEN the system SHALL list all of the user's notes
   (item type `nota`) that are not deleted or archived.
2. THE notes SHALL be grouped into sections by their owning category, each
   section showing the category name.
3. WITHIN a section THE notes SHALL be stacked vertically, newest first.
4. EACH note card SHALL show the note's title and a preview of its body.
5. WHERE the user has no notes THE view SHALL render a neutral empty state
   without error.
6. THE Notes view SHALL be reachable from a "Notes" entry in the sidebar
   navigation.

### Requirement 2: Search notes by title

**User Story:** As a user, I want to search my notes by title, so that I can find
one quickly without scrolling.

#### Acceptance Criteria

1. THE Notes view SHALL provide a search input that filters the visible notes by
   title, case-insensitively (substring match).
2. WHILE a search term is active THE view SHALL show only notes whose title
   matches, and SHALL hide sections that have no matching notes.
3. WHEN the search term is cleared THEN the system SHALL show all notes again.
4. WHERE no note matches the active search THE view SHALL show a neutral
   "no matches" state, not an error.

### Requirement 3: Create a note

**User Story:** As a user, I want to create a note with a title, a body, and a
section, so that I can capture ideas in the right place.

#### Acceptance Criteria

1. THE Notes view SHALL provide a way to create a note with a title, an optional
   body, and a target section (a list within a category).
2. WHEN a user creates a note THEN the system SHALL persist it as a `nota`-type
   planning item in the chosen list.
3. WHEN creation succeeds THEN the new note SHALL appear in its section
   immediately, without a full page reload.
4. WHERE creation fails THE system SHALL show an error message and SHALL NOT add
   a phantom note to the view.
5. WHERE the user has no list to place a note in THE create control SHALL guide
   the user (disabled or a clear hint) rather than failing silently.

### Requirement 4: Edit and delete a note

**User Story:** As a user, I want to edit or delete a note, so that I can keep my
notes current.

#### Acceptance Criteria

1. THE Notes view SHALL let the user edit a note's title, body, and section.
2. WHEN an edit succeeds THEN the updated note SHALL reflect the changes in place
   (moving to another section if its list changed).
3. THE Notes view SHALL let the user delete (archive) a note.
4. WHEN a delete succeeds THEN the note SHALL disappear from the view
   immediately.
5. WHERE an edit or delete fails THE system SHALL restore the prior state and
   show an error message.

### Requirement 5: Notes read endpoint

**User Story:** As a developer, I want an endpoint that returns the user's notes
with their section, so that the view can load in one request.

#### Acceptance Criteria

1. THE system SHALL expose `GET /api/notes` returning the authenticated user's
   `nota`-type items that are live (not deleted, not archived), each carrying its
   owning `categoryId` and `categoryName` (and category color).
2. THE endpoint SHALL order notes newest first (by `updatedAt` descending).
3. THE endpoint SHALL only return items owned by the authenticated user.
4. WHERE the user is not authenticated THE endpoint SHALL respond `401`.
5. THE endpoint SHALL NOT return non-`nota` items (tasks, events, etc.).

### Requirement 6: Reuse and non-interference

**User Story:** As a user, I want notes to reuse what already exists, so the app
stays consistent and nothing else breaks.

#### Acceptance Criteria

1. SECTIONS SHALL reuse the existing categories; the system SHALL NOT introduce a
   separate notes-only grouping concept.
2. NOTE create, edit, and delete SHALL reuse the existing
   `POST/PATCH/DELETE /api/planning-items` endpoints (no new write endpoints).
3. A note SHALL have no schedule (`startAt`/`endAt`/`dueAt`) requirement and SHALL
   NOT appear on the calendar.
4. THE existing task, list, category, and calendar behavior SHALL remain
   unchanged; notes remain visible in their list's task view as today.
