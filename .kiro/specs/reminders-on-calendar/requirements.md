# Requirements Document

## Introduction

Reminders (`remindAt`) currently surface only in the notification bell. They do
not appear on the calendar, because the calendar's range queries and mappers
key off `startAt` — an item with only a `remindAt` (a typical "recordatorio")
has no `startAt`, so it is invisible on the grid.

This change adds reminders to the **combined multi-category calendar**
(`/(app)/calendar`) as a distinct, toggleable **reminder layer**: each reminder
is shown as a **point marker at its `remindAt` instant** (with a bell affordance)
in every view (month, week, day, agenda), colored by its owning category, and
can be shown/hidden with a single "Reminders" toggle alongside the existing
per-category toggles. This is the roadmap step that establishes the "layer +
toggle" pattern the later type views (objectives, habits) will reuse.

Scope for this version:

- A new range endpoint `GET /api/calendar/reminders?from=&to=` returning the
  user's items whose `remindAt` falls in `[from, to)`, across all categories,
  each carrying its `categoryId` and category `color`.
- Reminders rendered as **point markers** (anchored at `remindAt`, no duration)
  in the combined calendar, visually distinct from scheduled events (a bell),
  across all four views.
- A single **Reminders** on/off toggle (session-scoped) in the calendar legend,
  in addition to the existing per-category toggles.
- Reminder markers are **read-only on the grid**: they are NOT drag-reschedulable
  (their time is edited in the task edit dialog); clicking one opens its detail
  peek.
- No schema changes: `remindAt` already exists.

Out of scope for this version:

- The per-category calendar (`/categories/[id]/calendar`) — it stays unchanged;
  the reminder layer is added only to the combined calendar.
- Editing `remindAt` from the calendar (drag or inline) — done in the edit
  dialog as today.
- Recurring reminders ("every N days") — deferred to the habits/recurrence work.
- Changing the bell behavior — the bell keeps showing DUE, un-acknowledged
  reminders; the calendar shows ALL reminders positioned in time.

## Glossary

- **Reminder**: A planning item with a non-null `remindAt`.
- **Reminder marker**: The calendar rendering of a reminder — a point element at
  its `remindAt` instant, distinct from a scheduled event block.
- **Reminder layer**: The set of all reminder markers, shown/hidden as a group by
  the Reminders toggle.
- **Scheduled event**: The existing calendar event anchored by `startAt`/`endAt`.
- **Reminders toggle**: The single on/off control that shows or hides the whole
  reminder layer.

## Requirements

### Requirement 1: See reminders on the combined calendar

**User Story:** As a user, I want my reminders to appear on the calendar at their
reminder time, so that I can see them in the context of the rest of my schedule.

#### Acceptance Criteria

1. THE combined calendar SHALL render each of the user's reminders whose
   `remindAt` falls in the visible range as a point marker at its `remindAt`
   instant.
2. THE reminder marker SHALL appear in all four views (month, week, day, agenda).
3. THE reminder marker SHALL be visually distinct from a scheduled event (a bell
   affordance) so the user can tell them apart at a glance.
4. WHERE a reminder's owning category has a color THE reminder marker SHALL be
   colored by that category (consistent with scheduled events).
5. WHERE an item has BOTH a `startAt` and a `remindAt` in the range THE calendar
   SHALL render two distinct markers: its scheduled event AND its reminder marker.
6. THE calendar SHALL show a reminder regardless of whether it has been
   acknowledged (`reminderSeenAt`); acknowledgement only affects the bell, not
   the calendar.
7. WHERE the user has no reminders in the visible range THE calendar SHALL render
   without error (no reminder markers).

### Requirement 2: Toggle the reminder layer

**User Story:** As a user, I want to show or hide all reminders on the calendar at
once, so that I can reduce clutter when I only care about scheduled events.

#### Acceptance Criteria

1. THE calendar legend SHALL present a single "Reminders" on/off toggle in
   addition to the per-category toggles.
2. WHEN the user turns the Reminders toggle off THEN the system SHALL hide all
   reminder markers from every view immediately, leaving scheduled events
   unaffected.
3. WHEN the user turns the Reminders toggle back on THEN the system SHALL show the
   reminder markers again.
4. WHEN the calendar first loads THEN the Reminders toggle SHALL default to on.
5. THE toggle state SHALL persist while navigating views and periods within the
   session.
6. WHERE a reminder's owning category is toggled off THE reminder marker SHALL be
   hidden too (reminders respect the per-category toggles), independently of the
   Reminders toggle.

### Requirement 3: Reminder markers are read-only on the grid

**User Story:** As a user, I want reminder markers to be safe to click without
accidentally moving them, since their time is set elsewhere.

#### Acceptance Criteria

1. THE reminder marker SHALL NOT be drag-reschedulable in the week and day views
   (only scheduled timed events are draggable).
2. WHEN a user clicks a reminder marker THEN the system SHALL open its detail peek
   showing at least its title and its reminder time.
3. THE reminder detail peek SHALL show the item type badge and description when
   present, consistent with the scheduled-event peek.
4. WHERE the user drags a scheduled event near or onto a reminder marker THE
   reminder marker SHALL NOT be affected and SHALL NOT participate in the
   no-overlap rule.

### Requirement 4: Reminders range endpoint

**User Story:** As a developer, I want an endpoint that returns the user's
reminders for a range, so that the calendar can load the reminder layer in one
request.

#### Acceptance Criteria

1. THE system SHALL expose `GET /api/calendar/reminders?from=&to=` returning the
   authenticated user's items whose `remindAt` falls in `[from, to)`, across all
   of that user's categories.
2. EACH returned item SHALL include its owning `categoryId` and the category's
   `color` (or null when unset), so the client can color it.
3. THE endpoint SHALL exclude soft-deleted and archived items.
4. WHERE `from` or `to` is missing or invalid THE endpoint SHALL respond `400`
   and SHALL NOT return partial data.
5. WHERE the user is not authenticated THE endpoint SHALL respond `401`.
6. THE endpoint SHALL only return items owned by the authenticated user.

### Requirement 5: Additive and non-interfering

**User Story:** As a user, I want the reminder layer to add to the calendar
without changing anything that already works.

#### Acceptance Criteria

1. THE existing `GET /api/calendar` scheduled-events endpoint SHALL remain
   unchanged.
2. THE per-category calendar (`/categories/[id]/calendar`) SHALL remain unchanged
   (no reminder layer there in this version).
3. THE drag-to-reschedule behavior and the no-overlap rule for scheduled events
   SHALL remain unchanged.
4. Setting or clearing `remindAt` SHALL NOT alter an item's `startAt`/`endAt`/
   `dueAt` (unchanged from the reminders feature).
