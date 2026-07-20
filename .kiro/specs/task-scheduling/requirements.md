# Requirements Document

## Introduction

Today a `PlanningItem` has a single temporal field, `dueAt` (a nullable
deadline). That is not enough to power a calendar that shows *what day and at
what time* an activity is scheduled, nor events that span a time range.

This change adds a proper **scheduling model** to planning items — a start
instant, an optional end instant, and an all-day flag — while keeping the
existing `dueAt` deadline as a separate, unchanged concept. It also exposes the
schedule in the task editor and provides a read API to fetch a category's
scheduled items within a date range. This is the foundation the per-category
calendar (a later spec) and the global dashboard will build on.

Scope decisions already agreed with the product owner:
- Add `startAt`, `endAt`, and `allDay`; keep `dueAt` as a separate deadline.
- Scheduling is **optional** — a task may have no schedule, only a `dueAt`, or a
  full start/end.
- Single-user timezone handling: timestamps are stored in UTC and rendered in
  the user's browser timezone (no per-user timezone field yet).
- This spec covers the data model, validation, editor fields, and the range
  query API only. The calendar UI and the dashboard are separate specs.
- Recurrence (repeating items) is explicitly out of scope for this spec.

## Glossary

- **Schedule**: The combination of `startAt`, `endAt`, and `allDay` that places
  a task on the calendar timeline.
- **startAt**: The instant a scheduled activity begins. When present, the task
  is considered "scheduled" and is eligible to appear on a calendar.
- **endAt**: The optional instant a scheduled activity ends. Only meaningful
  when `startAt` is present; must not be earlier than `startAt`.
- **allDay**: A flag marking a scheduled item as spanning whole day(s) rather
  than a specific time of day.
- **dueAt**: The existing, separate deadline field. Unchanged by this spec.
- **Scheduled item**: A task whose `startAt` is set.
- **Range query**: A request for a category's scheduled items whose schedule
  overlaps a given `[from, to)` date window.

## Requirements

### Requirement 1: Tasks carry an optional schedule

**User Story:** As a user, I want to give a task a start time, an optional end
time, and an all-day option, so that it can be placed on a calendar with a real
day and time.

#### Acceptance Criteria

1. THE `PlanningItem` model SHALL have a nullable `startAt` timestamp, a
   nullable `endAt` timestamp, and a non-null `allDay` boolean defaulting to
   `false`.
2. WHERE a task is created or updated without any schedule fields THE system
   SHALL persist it with `startAt` and `endAt` null and `allDay` false
   (scheduling is optional).
3. THE existing `dueAt` deadline SHALL remain a separate field with unchanged
   behavior; setting or clearing a schedule SHALL NOT modify `dueAt`.
4. WHEN a schedule is stored THEN the timestamps SHALL be persisted in UTC.

### Requirement 2: Schedule validation

**User Story:** As a user, I want the app to reject inconsistent schedules, so
that my calendar never shows an event that ends before it starts.

#### Acceptance Criteria

1. WHEN a request provides `endAt` without `startAt` THEN the system SHALL
   reject it with a validation error.
2. WHEN a request provides `endAt` earlier than `startAt` THEN the system SHALL
   reject it with a validation error.
3. WHEN a request provides `startAt` equal to or before `endAt` THEN the system
   SHALL accept the schedule.
4. WHEN a request marks a task `allDay` with a `startAt` THEN the system SHALL
   accept it and treat the time-of-day component as not significant.
5. WHERE only `startAt` is provided (no `endAt`) THE system SHALL accept it as a
   point-in-time scheduled item.

### Requirement 3: Editing a task's schedule

**User Story:** As a user, I want to set or change a task's start, end, and
all-day option from the task editor, so that I can schedule it without leaving
my workflow.

#### Acceptance Criteria

1. WHEN a user opens the task edit dialog THEN the system SHALL show controls for
   `startAt`, `endAt`, and `allDay`, pre-filled from the task's current values.
2. WHEN a user saves a valid schedule THEN the system SHALL persist it and the
   task SHALL reflect the new schedule.
3. WHEN a user clears the start time THEN the system SHALL clear the schedule
   (`startAt` and `endAt` become null) so the task is no longer scheduled.
4. WHEN a user enters an end earlier than the start THEN the system SHALL
   surface a validation message and SHALL NOT persist the change.
5. WHERE a task is marked all-day THE editor SHALL present the schedule as
   date(s) without requiring a time-of-day.

### Requirement 4: Query a category's scheduled items by date range

**User Story:** As a developer building the calendar, I want to fetch a
category's scheduled items within a date window, so that the calendar can render
only what falls in the visible period.

#### Acceptance Criteria

1. WHEN a client requests a category's scheduled items with a `from` and `to`
   date range THEN the system SHALL return that category's non-deleted tasks
   whose schedule overlaps the `[from, to)` window.
2. WHEN the requesting user does not own the category THEN the system SHALL
   respond with a not-found error.
3. WHEN the range parameters are missing or invalid (unparseable, or `to`
   before `from`) THEN the system SHALL respond with a validation error.
4. THE range query SHALL only include tasks that have a `startAt` (scheduled
   items); tasks without a schedule SHALL be excluded.
5. THE range query SHALL scope results to the tasks belonging to lists within
   the requested category (respecting the Category to List to Task hierarchy).

### Requirement 5: Backward compatibility

**User Story:** As a user with existing tasks, I want the schedule feature to be
added without disturbing my current tasks, so that nothing breaks.

#### Acceptance Criteria

1. WHEN the schedule fields are added THEN existing tasks SHALL default to no
   schedule (`startAt`/`endAt` null, `allDay` false) and SHALL remain valid.
2. THE existing task list and creation flows SHALL continue to work unchanged
   for tasks without a schedule.
3. WHERE a task has only a `dueAt` and no `startAt` THE system SHALL treat it as
   unscheduled for calendar purposes while preserving its deadline.
