# Requirements Document

## Introduction

Objectives (`itemType` key `objetivo`) are goals tracked over a timeframe with a
manual **progress** measure — not calendar events. They need their own view:
a stack of **progress bars ordered by deadline**, each showing how many **days
remain** before the objective's end date, so the user can see at a glance what is
closest to its deadline and how far along it is. Objectives must **not** appear on
the normal calendar and must never participate in the scheduling no-overlap rule.

To keep objectives fully separate from calendar scheduling, they use **dedicated
columns** for their timeframe (`objectiveStartAt` / `objectiveEndAt`) and a new
`progress` column — distinct from the `startAt`/`endAt` the calendar reads. This
gives objectives an editable start and end while the calendar and no-overlap
logic (which key off `startAt`) ignore them automatically, with no coupling.

Scope for this version:

- Three new nullable columns on `PlanningItem`: `objectiveStartAt`,
  `objectiveEndAt`, and `progress` (integer 0–100).
- A new route `/(app)/objectives` and an "Objectives" entry in the sidebar.
- A read endpoint `GET /api/objectives` returning the user's `objetivo` items
  (live), each carrying its owning category, ordered by deadline (soonest first).
- A stack of objective cards, each with a progress bar, the days remaining until
  the end date, and a status (active / overdue / completed / no deadline).
- Inline progress updating from the view, plus create/edit/delete of objectives
  (title, body, section, start, end, progress, and an optional reminder),
  reusing `POST/PATCH/DELETE /api/planning-items`.
- The objective's optional reminder reuses the existing `remindAt` (so it shows
  in the bell and the calendar reminder layer).

Out of scope for this version:

- **Recurring / periodic reminders** ("every N days") — deferred to the
  habits/recurrence work; this version supports a single `remindAt`.
- Auto-computing progress from elapsed time, sub-goals/checklists, or charts.
- Showing objectives anywhere on the calendar.

## Glossary

- **Objective**: A planning item whose item type is `objetivo`. Has a title, an
  optional body, a traceable timeframe (`objectiveStartAt` → `objectiveEndAt`),
  and a manual `progress` (0–100).
- **Progress**: An integer 0–100 the user sets to reflect how far along the
  objective is. Not derived from time.
- **Deadline**: The objective's `objectiveEndAt` — the date it should be done by.
- **Days remaining**: Whole calendar days from today until the deadline; negative
  once the deadline has passed.
- **Objective status**: `completed` (progress = 100), `overdue` (past deadline
  and not complete), `no-deadline` (no `objectiveEndAt`), or `active` otherwise.
- **Section**: The objective's owning category (its list's category), reused as
  in the notes view.

## Requirements

### Requirement 1: See objectives as stacked progress bars ordered by deadline

**User Story:** As a user, I want to see my objectives stacked with progress bars
and ordered by how soon they are due, so that I know what to focus on.

#### Acceptance Criteria

1. WHEN a user opens `/objectives` THEN the system SHALL list all of the user's
   objectives (item type `objetivo`) that are not deleted or archived.
2. EACH objective SHALL be rendered as a card with its title, its section
   (owning category), and a progress bar reflecting its progress.
3. THE objectives SHALL be ordered by deadline (`objectiveEndAt`) ascending —
   soonest first — with objectives that have no deadline sorted last.
4. THE objectives SHALL NOT appear on the calendar (combined or per-category).
5. WHERE the user has no objectives THE view SHALL render a neutral empty state
   without error.
6. THE Objectives view SHALL be reachable from an "Objectives" entry in the
   sidebar navigation.

### Requirement 2: Track and update progress

**User Story:** As a user, I want to update an objective's progress, so that the
bar reflects how far along I am.

#### Acceptance Criteria

1. EACH objective card SHALL show a progress bar reflecting its `progress`
   (0–100), with an accessible current value.
2. THE view SHALL let the user update an objective's progress inline.
3. THE system SHALL clamp progress to the range 0–100 (values outside are
   corrected).
4. WHEN a progress update succeeds THEN the new value SHALL persist and the bar
   SHALL reflect it; WHERE it fails THE prior value SHALL be restored with an
   error message.

### Requirement 3: See time remaining and status

**User Story:** As a user, I want to see how many days remain and whether an
objective is on track, overdue, or done, so that I can react in time.

#### Acceptance Criteria

1. WHERE an objective has a deadline THE card SHALL show the whole number of days
   remaining until `objectiveEndAt`.
2. WHERE the deadline has passed and progress is below 100 THE card SHALL show an
   overdue state.
3. WHERE progress is 100 THE card SHALL show a completed state.
4. WHERE an objective has no deadline THE card SHALL show a neutral "no deadline"
   state without a days count.

### Requirement 4: Traceable timeframe independent of the calendar

**User Story:** As a user, I want to set an objective's start and end dates, so
that its span is traceable — without it cluttering my calendar.

#### Acceptance Criteria

1. AN objective SHALL have an editable start (`objectiveStartAt`) and end
   (`objectiveEndAt`), each optional.
2. WHERE both are set THE system SHALL require `objectiveEndAt` to be on or after
   `objectiveStartAt`, rejecting an inconsistent timeframe.
3. THE objective timeframe SHALL be independent of `startAt`/`endAt`: setting it
   SHALL NOT place the objective on the calendar.
4. THE objective SHALL NOT participate in the timed no-overlap rule.

### Requirement 5: Create, edit, and delete objectives (with an optional reminder)

**User Story:** As a user, I want to create, edit, and delete objectives and
optionally attach a reminder, so that I can manage my goals.

#### Acceptance Criteria

1. THE Objectives view SHALL let the user create an objective with a title, an
   optional body, a section (a list within a category), a start date, an end
   date, an initial progress, and an optional reminder time.
2. WHEN an objective is created or edited THEN it SHALL persist as an
   `objetivo`-type planning item with the given timeframe, progress, and
   reminder.
3. THE Objectives view SHALL let the user edit those fields and delete (archive)
   an objective.
4. CREATE, edit, and delete SHALL reuse the existing
   `POST/PATCH/DELETE /api/planning-items` endpoints (no new write endpoints).
5. THE optional reminder SHALL reuse the existing `remindAt`, so it appears in
   the notification bell and the calendar reminder layer.
6. WHERE a create/edit/delete fails THE system SHALL surface an error and restore
   the prior state (no phantom objective).

### Requirement 6: Objectives read endpoint

**User Story:** As a developer, I want an endpoint that returns the user's
objectives with their section and fields, so that the view can load in one
request.

#### Acceptance Criteria

1. THE system SHALL expose `GET /api/objectives` returning the authenticated
   user's `objetivo`-type items that are live (not deleted, not archived), each
   carrying its owning `categoryId`/`categoryName`(/color) and its timeframe and
   progress.
2. THE endpoint SHALL order objectives by `objectiveEndAt` ascending with
   no-deadline objectives last.
3. THE endpoint SHALL only return items owned by the authenticated user.
4. WHERE the user is not authenticated THE endpoint SHALL respond `401`.
5. THE endpoint SHALL NOT return non-`objetivo` items.
