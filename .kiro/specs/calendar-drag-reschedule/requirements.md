# Requirements Document

## Introduction

The calendar is currently read-only. This change makes it **editable by
dragging**: in the week/day time-grid, a user can drag a timed event to a new
time (and day) to reschedule it, and the change is persisted. It builds directly
on D1's time-grid and the "no double-booking" rule — a drop onto an occupied
slot is rejected and the event snaps back.

Scope for this version:
- **Time-grid (week/day) drag only** for **timed** events: drag vertically to
  change the start time, and across columns (week view) to change the day,
  preserving the event's duration.
- Month-view drag and all-day-event drag are **out of scope** for this version.
- Reuses the existing `PATCH /api/planning-items/[id]` and the no-overlap rule;
  no schema changes. Editing via the FormSheet remains available (drag is an
  enhancement, not the only way to reschedule).

The exact drag mechanism (native HTML DnD vs. a pointer-events implementation
vs. a small DnD utility) is a **design decision**, resolved in design.md.

## Glossary

- **Reschedule**: Changing an event's `startAt` (and `endAt`, preserving
  duration) by dragging it.
- **Snap increment**: The time granularity a drop snaps to (e.g. 15 minutes).
- **Drop target**: A time/day position in the grid where a dragged event can be
  released.
- **Optimistic move**: Showing the event at its new position immediately, before
  the server confirms, and reverting if the request fails.

## Requirements

### Requirement 1: Drag a timed event to reschedule it

**User Story:** As a user, I want to drag an event to a new time, so that I can
reschedule it quickly without opening a form.

#### Acceptance Criteria

1. WHEN a user drags a timed event block within the week or day time-grid and
   drops it at a new position THEN the system SHALL update the event's `startAt`
   to the dropped time and shift `endAt` by the same amount, preserving the
   duration.
2. WHERE the week view is shown THE user SHALL be able to drop the event on a
   different day column, changing its date as well as its time.
3. THE drop time SHALL snap to a fixed increment (15 minutes).
4. WHEN the drag is released THEN the new schedule SHALL be persisted via
   `PATCH /api/planning-items/[id]`.
5. WHERE the event is all-day, or the view is month/agenda, THE event SHALL NOT
   be draggable in this version.

### Requirement 2: Overlap is prevented on drop

**User Story:** As a user, I want the calendar to stop me from dropping an event
onto an occupied slot, so that I never double-book myself.

#### Acceptance Criteria

1. WHEN a drop would make the event overlap another timed activity THEN the
   system SHALL reject the change (the existing no-overlap rule returns 400) and
   the event SHALL return to its original position.
2. WHEN a drop is rejected THEN the system SHALL surface a clear, non-blocking
   message explaining the conflict.
3. WHERE a drop only touches another event's boundary (e.g. moving to end
   exactly when another begins) THE drop SHALL be allowed.

### Requirement 3: Optimistic move with revert

**User Story:** As a user, I want the event to move immediately when I drop it,
so that the calendar feels responsive.

#### Acceptance Criteria

1. WHEN a user drops an event THEN the system SHALL show it at the new position
   immediately (optimistic), before the server responds.
2. WHEN the persist request fails (validation or network) THEN the system SHALL
   revert the event to its original position and show an error.
3. WHEN the persist request succeeds THEN the optimistic position SHALL be
   confirmed without a visible jump.

### Requirement 4: Drag affordance and feedback

**User Story:** As a user, I want clear feedback while dragging, so that I know
where the event will land.

#### Acceptance Criteria

1. WHILE dragging THE system SHALL give visual feedback (e.g. the block follows
   the pointer or a preview indicates the target slot).
2. THE draggable event SHALL still open its details on a plain click (drag and
   click must be distinguishable, not conflated).
3. WHERE a drag has not moved beyond a small threshold THE interaction SHALL be
   treated as a click (open details), not a reschedule.

### Requirement 5: Ownership and integrity

**User Story:** As a user, I want reschedules to respect the same rules as
editing, so that the data stays consistent.

#### Acceptance Criteria

1. THE reschedule SHALL go through the same owned-item update path, so a user can
   only reschedule their own items (server-side ownership is authoritative).
2. THE reschedule SHALL only change `startAt`/`endAt`; it SHALL NOT alter the
   event's list, title, priority, status, or `dueAt`.
3. WHERE the event has no `endAt` THE reschedule SHALL move `startAt` and keep
   `endAt` null (a point-in-time event stays point-in-time).
