# Requirements Document

## Introduction

Each category now has scheduled tasks (`startAt`/`endAt`/`allDay`) and an API to
fetch them by date range, but there is no way to *see* them on a calendar. This
change adds a **per-category calendar**: open a category and see its scheduled
activities laid out by day and time.

The calendar is a **custom component built in-house** (not FullCalendar or any
calendar library), styled with the app's shadcn/Base UI system. Version 1 ships
a **month view** and an **agenda view**, is **read-only** (no drag, create, or
inline edit), and keeps each category's calendar **separate** (the default the
product owner asked for). A combined multi-category view and a day/time-grid
view are explicitly out of scope for this spec.

Scope decisions already agreed with the product owner:
- **Per-category** calendars, reached from the sidebar/dashboard.
- **Custom** calendar component (imitate FullCalendar; do not depend on it).
- **Month + agenda** views in v1; day/hour grid and drag-to-reschedule later.
- **Read-only** in v1.
- Calendar **view state** (current month, active view) is held in a Zustand
  store; **event data** is fetched from the existing
  `GET /api/categories/[id]/calendar?from=&to=` endpoint.
- **Local timezone** rendering (timestamps are stored UTC).

## Glossary

- **Calendar event**: A scheduled planning item (has a `startAt`), shown on the
  calendar. Tasks without a `startAt` (deadline-only or unscheduled) do not
  appear.
- **Month view**: A 7-column grid of the weeks spanning the current month, each
  day cell listing that day's events.
- **Agenda view**: A chronological, day-grouped list of upcoming events.
- **Anchor date**: The date that determines which month the calendar shows.
- **Visible range**: The `[from, to)` window the calendar currently needs data
  for (the weeks shown in month view, or the agenda window).
- **All-day event**: An event with `allDay = true`, shown without a time.

## Requirements

### Requirement 1: Open a category's calendar

**User Story:** As a user, I want to open a calendar for a specific category, so
that I can see that category's scheduled activities on their own.

#### Acceptance Criteria

1. WHEN a user navigates to a category's calendar THEN the system SHALL render a
   calendar scoped to that category's scheduled items only.
2. THE user SHALL be able to reach a category's calendar from the sidebar and/or
   the dashboard (a per-category entry point).
3. WHEN a user opens the calendar for a category they do not own or that does
   not exist THEN the system SHALL show a not-found state.
4. THE calendar SHALL render inside the existing authenticated sidebar layout.

### Requirement 2: Month view

**User Story:** As a user, I want a month grid, so that I can see at a glance
which days have scheduled activities.

#### Acceptance Criteria

1. THE month view SHALL render the weeks spanning the anchor date's month as a
   7-column (Sun–Sat or Mon–Sun) grid, including the trailing/leading days that
   complete the first and last weeks.
2. EACH day cell SHALL list the events whose local time interval covers that
   day, showing each event's title and its local start time (or an "all day"
   indicator for all-day events).
3. THE cell for the current local day SHALL be visually distinguished.
4. WHERE a multi-day event spans several days in the visible grid THE event
   SHALL appear on each day it covers within that grid.
5. WHERE a day has more events than can be shown THE cell SHALL indicate the
   overflow (e.g. "+N more") rather than growing unbounded.

### Requirement 3: Agenda view

**User Story:** As a user, I want a list of what's coming up, so that I can read
my schedule top to bottom with times.

#### Acceptance Criteria

1. THE agenda view SHALL list the category's upcoming events in chronological
   order, grouped by local day.
2. EACH agenda entry SHALL show the event's title and its local start time (and
   end time when present), or an "all day" indicator.
3. WHERE the agenda window has no events THE view SHALL show a neutral empty
   message.

### Requirement 4: Navigation and view state

**User Story:** As a user, I want to move between months and switch views, so
that I can browse my schedule.

#### Acceptance Criteria

1. THE calendar SHALL provide controls to go to the previous month, the next
   month, and back to today.
2. THE calendar SHALL provide a toggle between month view and agenda view.
3. THE current view and anchor date SHALL be held in a Zustand store so they
   persist while the user navigates within the app session.
4. WHEN the user changes month or view THEN the visible range SHALL update and
   the events shown SHALL match the new range.

### Requirement 5: Event data and scoping

**User Story:** As a user, I want the calendar to load only the relevant events,
so that it stays fast and correct.

#### Acceptance Criteria

1. THE calendar SHALL fetch events for the current visible range from
   `GET /api/categories/[id]/calendar?from=&to=`.
2. THE calendar SHALL only display events returned for the current category
   (server-side ownership and category scoping are authoritative).
3. WHEN the event request fails THEN the system SHALL surface a non-blocking
   error and SHALL NOT crash the view.
4. WHEN the visible range changes THEN the calendar SHALL fetch the events for
   the new range.

### Requirement 6: Rendering rules

**User Story:** As a user, I want times shown correctly and consistently, so
that I trust the calendar.

#### Acceptance Criteria

1. THE calendar SHALL render event times in the user's local timezone
   (timestamps are stored in UTC).
2. THE calendar SHALL render an all-day event without a specific time.
3. THE calendar SHALL be read-only in this version — it SHALL NOT offer create,
   edit, delete, or drag-to-reschedule controls.

### Requirement 7: Loading and empty states

**User Story:** As a user, I want clear feedback while the calendar loads or when
there is nothing scheduled, so that I am never confused by a blank screen.

#### Acceptance Criteria

1. WHILE events are loading THE calendar SHALL show a loading indicator rather
   than an empty grid.
2. WHERE the visible range has no events THE month view SHALL still render the
   grid and the agenda view SHALL show a neutral empty message.
