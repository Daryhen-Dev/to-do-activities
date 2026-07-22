# Requirements Document

## Introduction

Habits (`itemType` key `habito`) are recurring activities the user intends to do
on a repeating schedule (for example "meditate every weekday at 8:00" or "water
the plants every 3 days"). Unlike tasks, events, or objectives, a habit is not a
single dated item and it is not a manual `progress` scalar — it is a **rule** plus
a history of **per-occurrence completions**, from which adherence (a streak and a
weekly ratio) is **computed**.

This is the last and heaviest spec of the item-types roadmap. There is currently
no recurrence column in the schema and no recurrence code anywhere; recurrence is
modeled from scratch here. The recurrence model is deliberately a **structured
simple** rule — a selection of days-of-week, a time-of-day, and an optional
"every N days" interval — not a full iCalendar RRULE. No RRULE library is
introduced.

A habit is stored as **one** `PlanningItem` row that carries the recurrence rule
in **dedicated nullable columns** (the same zero-coupling pattern objectives use
for `objectiveStartAt`/`objectiveEndAt`/`progress`). Individual occurrences are
**never materialized** as `PlanningItem` rows: they are computed on the fly over a
date window from the rule. Completions are tracked **per occurrence** in a new,
separate `HabitCompletion` table (habit reference + normalized occurrence date +
completion timestamp), scoped to the owning user and unique per `(habit, date)`.

Scope for this version (Phase 1 — core recurrence + completions + habits view):

- New nullable recurrence columns on `PlanningItem`: a set of recurrence
  days-of-week, a recurrence time-of-day, and an optional recurrence interval
  ("every N days").
- A new `HabitCompletion` table keyed on the owning user, the habit, and the
  normalized occurrence date, unique on `(habit, date)`, storing the completion
  timestamp.
- Creating and editing a habit with a recurrence rule via the existing
  `POST/PATCH/DELETE /api/planning-items` write path, with zod validation for the
  recurrence fields.
- A pure occurrence-generation helper that, given a habit's rule and a date
  window, returns the ordered set of scheduled occurrence dates.
- Marking a single occurrence complete or incomplete (idempotent per
  `(habit, date)`), where a completion may exist only for a date that the rule
  actually schedules.
- Computed **streak** (consecutive completed scheduled occurrences up to today)
  and computed **weekly adherence** ("X of Y this week"), derived from
  completions versus the schedule — never stored on the existing `progress`
  column.
- A dedicated Habits view (`/(app)/habits`) listing the user's habits, each with
  its streak, its weekly adherence, and a control to mark today's occurrence done
  (or undo it).
- Soft-delete / archive semantics consistent with the rest of `PlanningItem`.

Out of scope for this version (captured as future phases, not Phase 1 acceptance
criteria):

- **Habits on the calendar** as a toggleable expansion layer (reusing the
  "layer + toggle" pattern established by reminders-on-calendar) — a later phase.
- **Recurring reminders** ("every N days" reminders), deferred from the
  reminders/objectives specs — a later phase.
- Full iCalendar RRULE support (monthly/yearly rules, BYSETPOS, exceptions,
  end-after-N-occurrences), reminders per occurrence, and charts/history views.

## Glossary

- **Habit**: A planning item whose item type is `habito`. Carries a recurrence
  rule in dedicated columns; its occurrences are computed, not stored.
- **Recurrence rule**: The structured schedule of a habit — a set of
  recurrence days-of-week, a recurrence time-of-day, and an optional recurrence
  interval.
- **Recurrence days-of-week**: The subset of the seven weekdays (Monday through
  Sunday) on which the habit is scheduled.
- **Recurrence time-of-day**: The wall-clock time (hours and minutes) at which a
  scheduled occurrence is anchored on each of its dates.
- **Recurrence interval**: An optional positive integer N meaning the habit is
  scheduled every N days counted from the habit's anchor date, in addition to or
  instead of specific weekdays.
- **Anchor date**: The normalized start date from which a recurrence interval is
  counted (the habit's creation date when no explicit start is given).
- **Occurrence**: A single scheduled instance of a habit on one normalized date,
  computed from the recurrence rule. An occurrence is never a `PlanningItem` row.
- **Scheduled occurrence**: An occurrence whose normalized date the recurrence
  rule includes within a given date window.
- **Normalized date**: A calendar date (year, month, day) in the user's local
  time zone, with the time component removed, used as the completion key.
- **Date window**: A half-open date range `[from, to)` over which occurrences are
  computed.
- **Completion**: A `HabitCompletion` record marking one scheduled occurrence of
  a habit, keyed by `(habit, normalized date)`, storing when it was completed.
- **Streak**: The count of consecutive completed scheduled occurrences ending at
  the most recent scheduled occurrence on or before today.
- **Weekly adherence**: The ratio of completed scheduled occurrences to total
  scheduled occurrences within the current week, expressed as "X of Y".
- **Current week**: Monday 00:00 through the following Monday 00:00 in the user's
  local time zone (Monday–Sunday inclusive).
- **Habits view**: The route `/(app)/habits` listing the user's habits with
  their streak, weekly adherence, and a mark-today control.
- **Section**: A habit's owning category (its list's category), reused as in the
  notes and objectives views.

## Requirements

### Requirement 1: Define a habit with a structured recurrence rule

**User Story:** As a user, I want to give a habit a repeating schedule using
days-of-week, a time-of-day, and an optional "every N days" interval, so that the
app knows when the habit is due.

#### Acceptance Criteria

1. THE Habit SHALL store its recurrence rule in dedicated nullable columns on the `PlanningItem` row (recurrence days-of-week, recurrence time-of-day, and an optional recurrence interval), independent of `startAt`/`endAt`/`dueAt`.
2. WHERE the user selects one or more recurrence days-of-week THE system SHALL persist the selected value as a subset of 1 to 7 distinct days drawn from Monday through Sunday, with no duplicate day within the subset.
3. IF the submitted recurrence days-of-week contains a value outside Monday through Sunday or a duplicate day, THEN THE system SHALL reject the recurrence rule, retain any previously persisted recurrence rule unchanged, and return an error response indicating the days-of-week are invalid.
4. WHERE the user sets a recurrence interval of N days THE system SHALL persist N as an integer from 1 to 365 inclusive, counted from the habit's anchor date, where the anchor date is the calendar date on which the recurrence rule takes effect.
5. IF the submitted recurrence interval is not an integer or falls outside 1 to 365 inclusive, THEN THE system SHALL reject the recurrence rule, retain any previously persisted recurrence rule unchanged, and return an error response indicating the interval is out of range.
6. WHEN the user sets the recurrence time-of-day THE system SHALL persist it as an hours value from 0 to 23 inclusive and a minutes value from 0 to 59 inclusive.
7. IF the submitted recurrence time-of-day has an hours value outside 0 to 23 or a minutes value outside 0 to 59, THEN THE system SHALL reject the recurrence rule, retain any previously persisted recurrence rule unchanged, and return an error response indicating the time-of-day is invalid.
8. THE recurrence rule SHALL NOT place the habit on the calendar in this version and SHALL NOT participate in the timed no-overlap rule.
9. THE Habit SHALL remain a `habito`-type planning item carrying its `listId`, `itemTypeId`, and `statusId` like any other planning item.

### Requirement 2: Validate the recurrence rule

**User Story:** As a user, I want the app to reject an incomplete or invalid
recurrence rule, so that every habit has a schedule that can produce occurrences.

#### Acceptance Criteria

1. IF a habit is submitted with an empty day-of-week set and no recurrence interval, THEN THE system SHALL reject the submission with a validation error indicating that at least one day-of-week or a recurrence interval is required, and THE system SHALL NOT persist the habit.
2. IF a recurrence interval is submitted that is not an integer within the range 1 to 365 inclusive, THEN THE system SHALL reject the submission with a validation error indicating the allowed interval range, and THE system SHALL NOT persist the habit.
3. IF a recurrence time-of-day is submitted with an hour value outside 0 to 23 inclusive or a minute value outside 0 to 59 inclusive, THEN THE system SHALL reject the submission with a validation error indicating the invalid time-of-day, and THE system SHALL NOT persist the habit.
4. IF a recurrence day-of-week set contains any value that does not map to one of the seven days Monday through Sunday, or contains duplicate values, or contains more than 7 entries, THEN THE system SHALL reject the submission with a validation error indicating the invalid day-of-week value, and THE system SHALL NOT persist the habit.
5. WHEN a habit is submitted with a recurrence rule that satisfies criteria 1 through 4, THE system SHALL persist the habit through the existing `POST/PATCH /api/planning-items` write path and SHALL return the persisted habit to the caller.

### Requirement 3: Compute occurrences over a date window

**User Story:** As a user, I want the app to know exactly which dates a habit is
scheduled for, so that adherence and the mark-done control reflect the real
schedule.

#### Acceptance Criteria

1. WHEN a habit's recurrence rule and a half-open date window `[from, to)` are provided THE system SHALL return an ordered set of occurrence dates, each represented as a date-only value with no time-of-day component, that the rule schedules on or after `from` and before `to`.
2. WHERE the recurrence rule selects one or more days-of-week THE system SHALL include every date-only value in the window whose weekday belongs to the selected set.
3. WHERE the recurrence rule sets an interval of N days with N being an integer of at least 1 THE system SHALL include every date-only value in the window that falls on or after the anchor date and is an exact whole multiple of N days after the anchor date.
4. THE system SHALL include each qualifying date-only value in the occurrence set at most once and SHALL order the set ascending by date.
5. THE system SHALL exclude any date equal to the upper bound `to` from the occurrence set, and SHALL return an empty set when the window contains no qualifying dates or when `from` is greater than or equal to `to`.
6. THE occurrence computation SHALL be a pure function of the recurrence rule and the date window, SHALL return identical output for identical inputs, and SHALL NOT create `PlanningItem` rows.
7. WHERE the recurrence rule specifies both a days-of-week selection and an N-day interval THE system SHALL include only the date-only values in the window that satisfy both the days-of-week selection and the N-day interval.
8. IF the recurrence rule sets an interval of N days where N is less than 1 THEN THE system SHALL return an empty occurrence set and SHALL NOT create `PlanningItem` rows.

### Requirement 4: Mark an occurrence complete or incomplete

**User Story:** As a user, I want to mark a specific occurrence of a habit as done
or undo it, so that my adherence reflects what I actually did.

#### Acceptance Criteria

1. WHEN the user marks an occurrence of a habit complete for a normalized date (a date reduced to its calendar day with any time-of-day component removed) that the recurrence rule schedules, THE system SHALL create a single completion record keyed by `(habit, normalized date)` owned by the authenticated user and SHALL return confirmation that the completion was recorded.
2. IF a completion already exists for the same `(habit, normalized date)`, THEN THE system SHALL leave exactly one completion record unchanged and SHALL treat the repeated request as successful (idempotent).
3. WHEN the user marks a completed occurrence incomplete for a `(habit, normalized date)`, THE system SHALL remove the corresponding completion record and SHALL return confirmation that the completion was removed.
4. IF the user marks an occurrence incomplete for a `(habit, normalized date)` that has no existing completion record, THEN THE system SHALL make no change and SHALL treat the request as successful (idempotent).
5. IF the user attempts to complete an occurrence for a normalized date that the recurrence rule does not schedule, THEN THE system SHALL reject the request, SHALL NOT create a completion record, and SHALL return an error indicating the date is not scheduled.
6. IF the authenticated user is not the owner of the target habit, THEN THE system SHALL reject the completion or removal request, SHALL make no change to any completion record, and SHALL return an error indicating the habit is not accessible.
7. THE system SHALL scope every completion record to the owning user and SHALL enforce uniqueness per `(habit, normalized date)` such that at most one completion record exists for any `(habit, normalized date)`.
8. IF a completion creation or removal operation fails, THEN THE system SHALL restore the completion state that existed immediately before the operation and SHALL return an error indicating the operation did not complete.

### Requirement 5: Compute the streak

**User Story:** As a user, I want to see how many scheduled occurrences in a row I
have completed, so that I stay motivated to keep the habit going.

#### Acceptance Criteria

1. THE system SHALL compute a habit's streak as the count of consecutive completed scheduled occurrences ending at the most recent scheduled occurrence dated on or before today, where a completed scheduled occurrence is a scheduled occurrence that has a recorded completion for its date, and where today is the current date in the user's local time zone.
2. IF there is no scheduled occurrence dated on or before today, THEN THE system SHALL set the streak to 0.
3. IF the most recent scheduled occurrence dated on or before today does not have a recorded completion for its date, THEN THE system SHALL set the streak to 0.
4. THE system SHALL exclude scheduled occurrences dated after today from the streak computation.
5. WHEN counting backward the system reaches a scheduled occurrence without a recorded completion for its date, THE system SHALL stop the count at the last consecutively completed scheduled occurrence.
6. THE system SHALL count only dates scheduled by the recurrence rule and SHALL ignore non-scheduled dates between scheduled occurrences.
7. THE system SHALL compute the streak from recorded completions versus the schedule and SHALL NOT read the streak from or write the streak to the `progress` column.

### Requirement 6: Compute weekly adherence

**User Story:** As a user, I want to see how many of this week's scheduled
occurrences I have completed, so that I can gauge my consistency at a glance.

#### Acceptance Criteria

1. WHEN weekly adherence is computed for a habit, THE system SHALL report it as two non-negative integers: the numerator equal to the count of completed scheduled occurrences and the denominator equal to the count of total scheduled occurrences that fall within the current week.
2. THE current week SHALL be the half-open interval beginning at Monday 00:00:00 inclusive and ending at the following Monday 00:00:00 exclusive, evaluated in the user's local time zone.
3. WHEN a scheduled occurrence within the current week has at least one associated completion whose effective date falls within the current week interval, THE system SHALL count that occurrence as completed.
4. THE system SHALL count each scheduled occurrence as completed at most once, so that the completed count is always less than or equal to the total scheduled count for the same week.
5. IF the habit has no scheduled occurrence within the current week, THEN THE system SHALL report a numerator of 0 and a denominator of 0 without raising an error.
6. THE system SHALL derive weekly adherence solely from completions compared against the schedule and SHALL NOT read from or write to the `progress` column.

### Requirement 7: See habits in a dedicated view

**User Story:** As a user, I want a Habits view listing my habits with their
streak and weekly adherence and a way to mark today done, so that I can track and
maintain them in one place.

#### Acceptance Criteria

1. WHEN a user opens `/habits`, THE system SHALL display a list containing every habit belonging to the user with item type `habito` whose state is neither deleted nor archived, and SHALL exclude all deleted and archived habits.
2. THE system SHALL render each listed habit with its title, its owning category (section) name, its computed streak expressed as a whole number of consecutive completed scheduled occurrences, and its weekly adherence displayed as "X of Y this week", where X is the count of completed scheduled occurrences and Y is the total count of scheduled occurrences within the current week.
3. IF today is a scheduled occurrence of a habit, THEN THE system SHALL present, for that habit, a mark-today control that toggles today's occurrence between complete and not complete.
4. IF today is not a scheduled occurrence of a habit, THEN THE system SHALL display an indication that the habit is not scheduled today and SHALL NOT present a mark-today control for that habit.
5. WHEN the user toggles today's occurrence for a habit, THE system SHALL update that habit's displayed streak and weekly adherence to reflect the new completion state within 1 second.
6. WHILE the user has no habits matching the list criteria in criterion 1, THE system SHALL render an empty-state message indicating that no habits exist and SHALL NOT display an error indication.
7. THE system SHALL provide a "Habits" entry in the sidebar navigation that, when selected, opens the `/habits` view.
8. IF the habits cannot be retrieved when the user opens `/habits`, THEN THE system SHALL display an error indication that the habits could not be loaded, SHALL NOT display the empty state, and SHALL retain any previously loaded habit list unchanged.

### Requirement 8: Habits read endpoint

**User Story:** As a developer, I want an endpoint that returns the user's habits
with their recurrence rule, streak, and weekly adherence, so that the view can
load in one request.

#### Acceptance Criteria

1. THE system SHALL expose `GET /api/habits` returning the authenticated user's `habito`-type items that are live (not deleted, not archived), each carrying its owning `categoryId`/`categoryName`, its recurrence rule, its computed streak, and its computed weekly adherence.
2. THE endpoint SHALL only return items owned by the authenticated user.
3. THE endpoint SHALL NOT return non-`habito` items.
4. WHEN the endpoint computes streak for a returned habit, THE endpoint SHALL set streak to the count of consecutive completed scheduled occurrences ending at the most recent scheduled occurrence on or before today, stopping the count at the first scheduled occurrence that is not completed.
5. WHEN the endpoint computes weekly adherence for a returned habit, THE endpoint SHALL set it to the count of completed scheduled occurrences within the current week divided by the total count of scheduled occurrences within the current week, and SHALL set it to zero when the current week has zero scheduled occurrences.
6. WHEN the authenticated user has no live `habito`-type items, THE endpoint SHALL respond with success and an empty collection.
7. IF the request is not authenticated, THEN THE endpoint SHALL respond `401` and SHALL return no item data.
8. IF reading persisted data through the planning-item repository fails, THEN THE endpoint SHALL respond with a server error, SHALL return no partial data, and SHALL include an error indication in the response.
9. THE endpoint SHALL read persisted data only through the planning-item repository (the sole Prisma boundary), including the `HabitCompletion` records.

### Requirement 9: Create, edit, and archive habits

**User Story:** As a user, I want to create, edit, and archive habits, so that I
can manage my recurring activities.

#### Acceptance Criteria

1. THE Habits view SHALL let the user create a habit with a title (1 to 200 characters), an optional description (0 to 2000 characters), a section (a list within a category), and a recurrence rule consisting of days-of-week (zero or more weekdays), a time-of-day (a valid 24-hour value from 00:00 to 23:59), and an optional interval (an integer from 1 to 365).
2. WHEN a habit is created or edited with a title of 1 to 200 characters, a description of 0 to 2000 characters, and a recurrence rule that includes at least one weekday OR a valid interval from 1 to 365 together with a valid 24-hour time-of-day, THE system SHALL persist it as a `habito`-type planning item with the given recurrence rule.
3. WHEN the user creates, edits, or archives a habit, THE system SHALL reuse the existing `POST/PATCH/DELETE /api/planning-items` endpoints and SHALL NOT introduce any new write endpoint for the habit row itself.
4. THE Habits view SHALL let the user edit the title, description, section, and recurrence rule fields and archive (soft-delete) a habit.
5. WHEN a habit is archived or soft-deleted, THE system SHALL exclude it from both the Habits view and the habits read endpoint, consistent with the rest of `PlanningItem`.
6. IF a create, edit, or archive request has an empty title, a title longer than 200 characters, a description longer than 2000 characters, zero weekdays and no interval, an invalid time-of-day, or an interval outside 1 to 365, THEN THE system SHALL reject the request, return an error response indicating the invalid field, and make no change to stored state.
7. IF a create, edit, or archive operation fails, THEN THE system SHALL surface an error response indicating the failure and restore the prior state with no phantom or orphaned habit.
