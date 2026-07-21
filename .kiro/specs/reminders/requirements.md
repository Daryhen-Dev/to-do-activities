# Requirements Document

## Introduction

Today the app can schedule items (`startAt`/`endAt`/`dueAt`) and show them on
calendars, but it never actively tells the user "this is happening now". The
seeded `recordatorio` item type exists, yet nothing fires when its time comes.

This change adds **in-app reminders**: a user can attach a **reminder time**
(`remindAt`) to any planning item, and while the app is open the system surfaces
reminders whose time has arrived through a **notification bell** in the top bar
(with an unread count) and a **toast** when a reminder first becomes due. The
user can **dismiss** (acknowledge) a reminder so it stops showing.

Scope for this version (Option A — in-app only):

- A `remindAt` (nullable) time on `PlanningItem`, set/cleared from the task
  **edit dialog** (the same place `dueAt`/`startAt` are edited).
- A `reminderSeenAt` (nullable) acknowledgement timestamp on `PlanningItem`, so
  a dismissed reminder stays dismissed across reloads and devices (server-side,
  not `localStorage`).
- A **due-reminders** read endpoint `GET /api/reminders` and an **acknowledge**
  endpoint `POST /api/reminders/[id]/seen`.
- A **notification bell** client component in the `(app)` top bar: unread count
  badge + a list of due reminders, each dismissable. Polls periodically and on
  window focus while the app is open.
- A **toast** (via the already-installed `sonner`) when a reminder first
  transitions to due in the current session.
- Reminders are **orthogonal to item type**: any item can carry a `remindAt`,
  not only the `recordatorio` type. (The type stays a semantic label.)

Out of scope for this version (explicitly deferred):

- **Browser Web Push / OS notifications** and **email** — both require a
  server-side scheduler (cron/queue) and external config; they are the next
  roadmap steps (Options B/C) and build on this data model without rework.
- Setting a reminder from the **quick-add** form (kept minimal: title + type);
  reminders are set in the edit dialog, one click away.
- **Recurring** reminders (tied to the future recurrence/RRULE work).
- Snooze / re-notify after dismiss, and per-user notification preferences.

## Glossary

- **Reminder**: A planning item that has a non-null `remindAt`.
- **remindAt**: The instant a reminder should surface to the user.
- **reminderSeenAt**: The instant the user acknowledged (dismissed) the reminder.
  `null` means "not yet acknowledged".
- **Due reminder**: A live (`deletedAt IS NULL`, `archived = false`) item whose
  `remindAt` is at or before "now" and whose `reminderSeenAt IS NULL`.
- **Acknowledge / dismiss**: Marking a due reminder as seen by setting
  `reminderSeenAt = now`, which removes it from the due set permanently.
- **Notification bell**: The top-bar control showing the count of due reminders
  and the list of them.

## Requirements

### Requirement 1: Attach a reminder time to an item

**User Story:** As a user, I want to set a reminder time on a task, so that the
app can alert me when that time arrives.

#### Acceptance Criteria

1. THE task edit dialog SHALL provide a control to set a `remindAt` date-and-time
   on an item.
2. WHEN a user saves an item with a `remindAt` THEN the system SHALL persist that
   value against the item.
3. THE user SHALL be able to clear a previously set `remindAt` (set it back to
   none) from the same control.
4. WHEN a user changes an item's `remindAt` to a new time AFTER previously
   dismissing it THEN the system SHALL treat it as pending again (a new
   `remindAt` clears the prior acknowledgement so the reminder can fire again).
5. THE reminder time SHALL be settable on any item regardless of its item type.
6. WHERE an item has no `remindAt` THE system SHALL never surface it as a
   reminder.

### Requirement 2: Be notified when a reminder is due

**User Story:** As a user, I want the app to tell me when a reminder's time has
arrived while I'm using it, so that I don't miss it.

#### Acceptance Criteria

1. THE `(app)` top bar SHALL show a notification bell with a badge count of the
   current user's due reminders.
2. WHERE the user has no due reminders THE bell SHALL show no count badge (or a
   zero/empty state) and SHALL NOT display an error.
3. WHEN a reminder first becomes due during an open session THEN the system SHALL
   show a toast announcing it.
4. THE system SHALL show the toast for a given reminder at most once per session
   (it SHALL NOT re-toast the same still-due reminder on every poll).
5. THE bell count and list SHALL refresh periodically while the app is open and
   SHALL refresh when the window regains focus, without a full page reload.
6. THE due set SHALL only ever include items owned by the authenticated user.

### Requirement 3: Review and dismiss due reminders

**User Story:** As a user, I want to see my due reminders and dismiss them, so
that I can clear the ones I've handled.

#### Acceptance Criteria

1. WHEN a user opens the notification bell THEN the system SHALL list the due
   reminders, each showing at least its title and its reminder time.
2. THE list SHALL provide a control to dismiss (acknowledge) each reminder.
3. WHEN a user dismisses a reminder THEN the system SHALL mark it acknowledged
   and remove it from the due set (and the badge count) immediately.
4. WHERE dismissing fails on the server THE system SHALL restore the reminder in
   the list and count and show an error message.
5. WHERE there are no due reminders THE bell content SHALL show an empty state,
   not an error.
6. A dismissed reminder SHALL stay dismissed across reloads and other devices
   (the acknowledgement is stored server-side).

### Requirement 4: Reminder endpoints

**User Story:** As a developer, I want dedicated endpoints for reading due
reminders and acknowledging them, so that the bell stays thin and the
acknowledgement surface is explicit.

#### Acceptance Criteria

1. THE system SHALL expose `GET /api/reminders` returning the authenticated
   user's due reminders (live, `remindAt <= now`, `reminderSeenAt IS NULL`),
   ordered by `remindAt` ascending.
2. THE system SHALL expose `POST /api/reminders/[id]/seen` that sets
   `reminderSeenAt = now` for an owned reminder and returns the updated item.
3. WHERE the acknowledged id does not exist or is not owned by the caller THE
   endpoint SHALL respond `404` and SHALL NOT reveal the item's existence.
4. WHERE the user is not authenticated THE reminder endpoints SHALL respond
   `401`.
5. `reminderSeenAt` SHALL NOT be settable through the general
   `PATCH /api/planning-items/[id]` surface; acknowledgement happens only via the
   dedicated endpoint.

### Requirement 5: Reminder data is consistent with the rest of the item

**User Story:** As a user, I want reminders to behave correctly alongside
scheduling, completion and deletion, so that I'm not nagged about things that no
longer matter.

#### Acceptance Criteria

1. WHERE an item is soft-deleted (`deletedAt` set) THE system SHALL NOT surface
   it as a due reminder.
2. WHERE an item is archived (`archived = true`) THE system SHALL NOT surface it
   as a due reminder.
3. THE `remindAt` value SHALL be independent of `startAt`/`endAt`/`dueAt`: setting
   or clearing a reminder SHALL NOT alter the item's schedule, and the no-overlap
   scheduling rule SHALL NOT apply to `remindAt`.
4. WHEN an item with a future `remindAt` is created or updated THEN the system
   SHALL NOT surface it until "now" reaches `remindAt`.
