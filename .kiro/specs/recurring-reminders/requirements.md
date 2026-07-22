# Requirements Document

## Introduction

Reminders (`itemType` key `recordatorio`) currently fire once: they carry a
single `remindAt` instant and a single `reminderSeenAt` acknowledgement, and the
notification bell surfaces those whose `remindAt` has passed and are not yet
acknowledged. There is no way to say "remind me every weekday at 9:00" or "every
3 days".

This change adds **recurring reminders** by letting a reminder carry the same
structured recurrence rule that habits already use (days-of-week + time-of-day +
optional "every N days" interval), stored in the existing dedicated
`PlanningItem` recurrence columns. A reminder that has a recurrence rule is
**recurring**; a reminder without one keeps its existing one-shot `remindAt`
behavior, unchanged.

Acknowledgement for a recurring reminder uses a **watermark**: the existing
`reminderSeenAt` column is reinterpreted as "dismissed up to this instant". The
bell surfaces a recurring reminder's **current occurrence** (the most recent
occurrence at or before now) when that occurrence has not been dismissed;
dismissing stamps `reminderSeenAt = now`, which re-arms the reminder for its next
occurrence. This reuses the recurrence machinery (`generateOccurrences`) and the
existing column — **no schema changes and no new table**.

On the calendar, recurring reminders are **expanded into occurrence markers**
within the visible window on the existing reminder layer, alongside the one-shot
reminder markers.

Scope for this version:

- Setting/editing a recurrence rule on a reminder (reusing the habit recurrence
  fields), with validation.
- Bell "current occurrence due" semantics for recurring reminders via the
  `reminderSeenAt` watermark; dismissing re-arms the next occurrence.
- Recurring reminders expanded into occurrence markers on the calendar reminder
  layer, respecting the existing Reminders toggle and per-category toggles.
- No schema changes: the recurrence columns and `reminderSeenAt` already exist.

Out of scope for this version (captured as notes, not acceptance criteria):

- A per-occurrence acknowledgement history (a "reminder completions" table) — the
  watermark deliberately keeps only the dismissed-up-to instant.
- Habits behavior (unchanged) and full iCalendar RRULE support (a later phase).
- Snoozing an occurrence to a custom time.

## Glossary

- **Reminder**: A planning item whose item type is `recordatorio`.
- **One-shot reminder**: A reminder with a `remindAt` and no recurrence rule
  (the existing behavior).
- **Recurring reminder**: A reminder that carries a recurrence rule
  (days-of-week + time-of-day + optional interval).
- **Recurrence rule**: The structured schedule reused from habits — a set of
  days-of-week, a time-of-day, and an optional "every N days" interval.
- **Occurrence**: A single scheduled instant of a recurring reminder on one date
  at its time-of-day, computed from the rule; never a stored row.
- **Current occurrence**: The most recent occurrence at or before "now".
- **Watermark**: The `reminderSeenAt` instant, reinterpreted as "dismissed up to
  here"; an occurrence is due when the watermark is null or earlier than the
  occurrence's instant.
- **Due**: For a recurring reminder, its current occurrence exists and is not
  covered by the watermark; for a one-shot reminder, `remindAt <= now` and not
  acknowledged (unchanged).
- **Bell**: The notification dropdown listing due reminders.

## Requirements

### Requirement 1: Give a reminder a recurrence rule

**User Story:** As a user, I want to set a repeating schedule on a reminder, so
that it reminds me again and again instead of only once.

#### Acceptance Criteria

1. THE system SHALL let a `recordatorio` item carry a recurrence rule
   (days-of-week, time-of-day, and an optional "every N days" interval) in the
   existing dedicated `PlanningItem` recurrence columns.
2. WHERE a reminder has a recurrence rule THE system SHALL treat it as a
   recurring reminder and SHALL derive its reminder instants from the rule rather
   than from `remindAt`.
3. WHERE a reminder has no recurrence rule THE system SHALL keep its existing
   one-shot `remindAt` behavior unchanged.
4. THE recurrence rule SHALL NOT place the reminder on the schedule/calendar via
   `startAt` and SHALL NOT participate in the timed no-overlap rule.

### Requirement 2: Validate a recurring reminder's rule

**User Story:** As a user, I want the app to reject an invalid recurrence rule on
a reminder, so that every recurring reminder has a schedule that can produce
occurrences.

#### Acceptance Criteria

1. IF a recurring reminder is submitted with an empty day-of-week set and no
   interval THEN the system SHALL reject the submission with a validation error
   and SHALL NOT persist the reminder.
2. IF a recurrence interval is submitted that is not an integer within 1 to 365
   inclusive THEN the system SHALL reject the submission with a validation error.
3. IF a recurrence time-of-day is submitted outside 00:00 to 23:59 THEN the
   system SHALL reject the submission with a validation error.
4. IF a recurrence day-of-week value outside Monday through Sunday (or a
   duplicate) is submitted THEN the system SHALL reject the submission with a
   validation error.
5. WHERE the recurrence rule is valid THE system SHALL persist the reminder
   through the existing `POST/PATCH /api/planning-items` write path.

### Requirement 3: The bell surfaces a recurring reminder's current occurrence

**User Story:** As a user, I want a recurring reminder to appear in the bell when
its latest scheduled time has arrived, so that I act on it each time it recurs.

#### Acceptance Criteria

1. THE bell SHALL treat a recurring reminder as due WHEN its current occurrence
   (the most recent occurrence at or before now) exists AND the `reminderSeenAt`
   watermark is null or earlier than that occurrence's instant.
2. WHERE a recurring reminder has no occurrence at or before now THE bell SHALL
   NOT show it.
3. WHERE the `reminderSeenAt` watermark is at or after the current occurrence's
   instant THE bell SHALL NOT show the recurring reminder (it was already
   dismissed for this occurrence).
4. THE bell SHALL continue to surface one-shot reminders exactly as before
   (`remindAt <= now` and not acknowledged).
5. THE due computation SHALL use the server clock and SHALL be scoped to the
   authenticated user.

### Requirement 4: Dismissing re-arms the next occurrence

**User Story:** As a user, I want dismissing a recurring reminder to clear it
until its next scheduled time, so that it comes back on schedule instead of
disappearing forever.

#### Acceptance Criteria

1. WHEN the user dismisses a recurring reminder from the bell THE system SHALL set
   its `reminderSeenAt` watermark to the current server time.
2. WHEN the watermark is set to now THE current occurrence SHALL no longer be due,
   and the reminder's next occurrence after now SHALL become due once its instant
   passes.
3. THE dismiss action SHALL reuse the existing acknowledge endpoint/flow and SHALL
   be scoped to the owning user (a foreign or missing id yields a not-found
   result without leaking existence).
4. WHERE a one-shot reminder is dismissed THE behavior SHALL remain unchanged
   (acknowledged once, does not return).

### Requirement 5: Recurring reminders on the calendar

**User Story:** As a user, I want my recurring reminders to appear on the calendar
on each day they recur, so that I can see them in context.

#### Acceptance Criteria

1. THE calendar reminder layer SHALL render one marker per recurring-reminder
   occurrence whose instant falls within the visible range `[from, to)`.
2. THE recurring-reminder occurrence markers SHALL appear in all four views
   (month, week, day, agenda) as reminder markers, colored by owning category.
3. THE recurring-reminder occurrence markers SHALL be shown/hidden by the existing
   Reminders toggle and SHALL respect the per-category toggles.
4. THE one-shot reminder markers (anchored at `remindAt`) SHALL continue to render
   unchanged.
5. THE occurrence markers SHALL be read-only on the grid (not drag-reschedulable);
   clicking one opens its detail peek.

### Requirement 6: Additive and non-interfering

**User Story:** As a user, I want recurring reminders to add to what exists
without changing anything that already works.

#### Acceptance Criteria

1. THE one-shot reminder behavior (bell, calendar marker, acknowledgement) SHALL
   remain unchanged for reminders without a recurrence rule.
2. THE habits feature (its recurrence, view, completions, and calendar layer)
   SHALL remain unchanged.
3. THE system SHALL introduce no schema changes and no new table (the recurrence
   columns and `reminderSeenAt` already exist).
4. WHERE a reminder is soft-deleted or archived THE system SHALL exclude it from
   the bell and the calendar, consistent with the rest of `PlanningItem`.
