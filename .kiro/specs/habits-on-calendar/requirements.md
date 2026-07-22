# Requirements Document

## Introduction

Habits (`itemType` key `habito`) currently surface only in the dedicated Habits
view (`/(app)/habits`). They do not appear on the calendar, because the
calendar's range queries and mappers key off `startAt` — a habit has no
`startAt` (it carries a recurrence rule in dedicated columns), so it is invisible
on the grid.

This change adds habits to the **combined multi-category calendar**
(`/(app)/calendar`) as a distinct, toggleable **habit layer**. The crucial
difference from the reminder layer: a habit is a recurrence **rule**, not a single
dated item, so each habit must be **expanded into its scheduled occurrences
within the visible window** and each occurrence rendered as its own marker. This
reuses the "layer + toggle" pattern established by `reminders-on-calendar` and the
pure recurrence logic established by `habits-recurrence`
(`generateOccurrences`, `ruleFromItem`, completion sets).

Scope for this version:

- A new range endpoint `GET /api/calendar/habits?from=&to=` returning the
  authenticated user's **expanded habit occurrences** whose normalized date falls
  in `[from, to)`, across all categories. Each occurrence carries its habit id and
  title, the occurrence date, the habit's time-of-day (used to anchor the marker
  within the day, or all-day when the habit has no time-of-day), its owning
  `categoryId` and category color, and whether THAT occurrence is completed.
- Habit occurrences rendered as **markers** (a repeat affordance) in all four
  views (month, week, day, agenda), colored by owning category, visually distinct
  from scheduled events and reminder markers, with completed occurrences visually
  distinguished from not-yet-completed ones.
- A single session-scoped **Habits** on/off toggle in the calendar legend, in
  addition to the existing per-category toggles and the Reminders toggle.
- Habit markers are **read-only on the grid**: NOT drag-reschedulable; clicking
  one opens its detail peek.
- No schema changes: the recurrence columns and the `HabitCompletion` table
  already exist from the `habits-recurrence` feature.

Out of scope for this version (captured as notes, not acceptance criteria):

- Marking a habit occurrence complete/incomplete FROM the calendar — completion
  stays in the `/habits` view; the calendar only DISPLAYS completion state.
- Editing the recurrence rule from the calendar (done in the habit form dialog).
- The per-category calendar (`/categories/[id]/calendar`) — it stays unchanged;
  the habit layer is added only to the combined calendar.
- Recurring reminders and full iCalendar RRULE support — separate future phases.

## Glossary

- **Habit**: A planning item whose item type is `habito`, carrying a recurrence
  rule in dedicated columns.
- **Recurrence rule**: The structured schedule of a habit (days-of-week +
  time-of-day + optional "every N days" interval).
- **Occurrence**: A single scheduled instance of a habit on one normalized date,
  computed from the recurrence rule; never a stored row.
- **Occurrence marker**: The calendar rendering of one habit occurrence — a
  marker on its date (a point at the time-of-day, or an all-day marker), distinct
  from a scheduled event block and a reminder marker.
- **Habit layer**: The set of all habit occurrence markers, shown/hidden as a
  group by the Habits toggle.
- **Completed occurrence**: An occurrence whose `(habit, date)` has a
  `HabitCompletion` record.
- **Scheduled event**: The existing calendar event anchored by `startAt`/`endAt`.
- **Reminder marker**: The existing reminder-layer rendering (a point at
  `remindAt`).
- **Habits toggle**: The single on/off control that shows or hides the whole
  habit layer.
- **Visible range**: The half-open date window `[from, to)` the calendar
  currently displays.

## Requirements

### Requirement 1: See habit occurrences on the combined calendar

**User Story:** As a user, I want my habits to appear on the calendar on each day
they are scheduled, so that I can see them alongside the rest of my schedule.

#### Acceptance Criteria

1. THE combined calendar SHALL render, for each of the user's habits, one
   occurrence marker for every date the habit's recurrence rule schedules within
   the visible range `[from, to)`.
2. THE occurrence markers SHALL appear in all four views (month, week, day,
   agenda).
3. WHERE a habit has a time-of-day THE occurrence marker SHALL be anchored at that
   time-of-day in the week and day views; WHERE a habit has no time-of-day THE
   occurrence marker SHALL render as an all-day marker.
4. THE occurrence marker SHALL be visually distinct from a scheduled event and
   from a reminder marker so the user can tell them apart at a glance.
5. WHERE a habit's owning category has a color THE occurrence marker SHALL be
   colored by that category.
6. WHERE an occurrence is completed THE occurrence marker SHALL be visually
   distinguished from a not-yet-completed occurrence.
7. WHERE the user has no habit occurrences in the visible range THE calendar SHALL
   render without error (no habit markers).

### Requirement 2: Toggle the habit layer

**User Story:** As a user, I want to show or hide all habit occurrences on the
calendar at once, so that I can reduce clutter when I only care about scheduled
events.

#### Acceptance Criteria

1. THE calendar legend SHALL present a single "Habits" on/off toggle in addition
   to the per-category toggles and the Reminders toggle.
2. WHEN the user turns the Habits toggle off THEN the system SHALL hide all habit
   occurrence markers from every view immediately, leaving scheduled events and
   reminder markers unaffected.
3. WHEN the user turns the Habits toggle back on THEN the system SHALL show the
   habit occurrence markers again.
4. WHEN the calendar first loads THEN the Habits toggle SHALL default to on.
5. THE toggle state SHALL persist while navigating views and periods within the
   session.
6. WHERE a habit's owning category is toggled off THE occurrence markers for that
   habit SHALL be hidden too, independently of the Habits toggle.

### Requirement 3: Habit markers are read-only on the grid

**User Story:** As a user, I want habit markers to be safe to click without
accidentally moving them, since their schedule is set elsewhere.

#### Acceptance Criteria

1. THE occurrence marker SHALL NOT be drag-reschedulable in the week and day views
   (only scheduled timed events are draggable).
2. WHEN a user clicks an occurrence marker THEN the system SHALL open its detail
   peek showing at least its title and the occurrence date/time.
3. THE occurrence detail peek SHALL show the item type badge and the completion
   state of that occurrence.
4. WHERE the user drags a scheduled event near or onto an occurrence marker THE
   occurrence marker SHALL NOT be affected and SHALL NOT participate in the
   no-overlap rule.

### Requirement 4: Habit occurrences range endpoint

**User Story:** As a developer, I want an endpoint that returns the user's habit
occurrences for a range, so that the calendar can load the habit layer in one
request.

#### Acceptance Criteria

1. THE system SHALL expose `GET /api/calendar/habits?from=&to=` returning the
   authenticated user's habit occurrences whose normalized date falls in
   `[from, to)`, across all of that user's categories, expanded from each habit's
   recurrence rule.
2. EACH returned occurrence SHALL include its habit id, title, occurrence date,
   the habit's time-of-day (or an indication that it is all-day), its owning
   `categoryId` and the category's color (or null when unset), and whether that
   occurrence is completed.
3. THE endpoint SHALL exclude soft-deleted and archived habits.
4. IF `from` or `to` is missing or invalid THEN the endpoint SHALL respond `400`
   and SHALL NOT return partial data.
5. IF the user is not authenticated THEN the endpoint SHALL respond `401`.
6. THE endpoint SHALL only return occurrences of habits owned by the
   authenticated user.
7. THE endpoint SHALL read persisted data only through the planning-item
   repository (the sole Prisma boundary), including the `HabitCompletion` records.

### Requirement 5: Additive and non-interfering

**User Story:** As a user, I want the habit layer to add to the calendar without
changing anything that already works.

#### Acceptance Criteria

1. THE existing `GET /api/calendar` scheduled-events endpoint SHALL remain
   unchanged.
2. THE existing `GET /api/calendar/reminders` endpoint and reminder layer SHALL
   remain unchanged.
3. THE per-category calendar (`/categories/[id]/calendar`) SHALL remain unchanged
   (no habit layer there in this version).
4. THE drag-to-reschedule behavior and the no-overlap rule for scheduled events
   SHALL remain unchanged.
5. THE Habits view (`/(app)/habits`) and the habit write path
   (`/api/planning-items`, `/api/habits/[id]/completions`) SHALL remain unchanged.
