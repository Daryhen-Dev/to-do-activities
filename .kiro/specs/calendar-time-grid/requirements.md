# Requirements Document

## Introduction

The category calendar currently offers a month grid and an agenda list — good
for "which days" but not for "what time". This change adds **week** and **day**
views with an **hour grid** (a time axis with events positioned by their start
and sized by their duration), the way people expect from a calendar app.

It extends the existing per-category calendar (custom, in-house — still no
calendar library) and stays **read-only**: dragging to reschedule is a later
spec (D2). All-day events get their own strip; timed events are laid out on the
hour grid, and overlapping events are placed side by side so none are hidden.

Scope decisions already agreed with the product owner:
- Add **week** and **day** hour-grid views (alongside the existing month/agenda).
- **Read-only** — no drag/resize/create here (that is D2).
- **Custom** rendering (no calendar library); reuse the Spec A range endpoint.
- **Local timezone** rendering; view state stays in the existing Zustand store.
- No schema changes.

## Glossary

- **Time grid**: A view with a vertical hour axis (e.g. 00:00–24:00) and one
  column per day, where a timed event is a block positioned by its start and
  sized by its duration.
- **Week view**: A time grid with 7 day columns for the anchor week.
- **Day view**: A time grid with a single day column.
- **All-day strip**: A row above the hour grid holding that day's all-day
  events.
- **Overlap lane**: One of the side-by-side sub-columns used to lay out events
  whose times overlap so all remain visible.
- **Now indicator**: A horizontal line marking the current local time on today's
  column.

## Requirements

### Requirement 1: Week and day hour-grid views

**User Story:** As a user, I want week and day views with an hour grid, so that I
can see what is scheduled and at what time.

#### Acceptance Criteria

1. THE calendar SHALL offer a **week** view (7 day columns for the anchor week)
   and a **day** view (a single day column), each with a vertical hour axis.
2. WHEN a timed event is shown THEN it SHALL be positioned vertically by its
   local start time and sized by its duration (start to end).
3. WHERE an event has a `startAt` but no `endAt` THE view SHALL render it with a
   sensible default block height.
4. THE hour axis SHALL be labeled in the user's local time.
5. THE view SHALL be scrollable across the full day and SHALL default to showing
   a reasonable working range without hiding earlier/later events.

### Requirement 2: All-day events

**User Story:** As a user, I want all-day events separated from timed ones, so
that the hour grid stays readable.

#### Acceptance Criteria

1. THE week and day views SHALL render all-day events in an all-day strip above
   the hour grid, under their day's column.
2. THE all-day strip SHALL NOT place all-day events on the hour axis.

### Requirement 3: Overlapping events stay visible

**User Story:** As a user, I want overlapping events laid out side by side, so
that I can see all of them.

#### Acceptance Criteria

1. WHEN two or more timed events overlap in time within the same day THEN the
   view SHALL lay them out in side-by-side lanes so each is visible.
2. WHERE events do not overlap THE events SHALL use the full column width.

### Requirement 4: View toggle and view-aware navigation

**User Story:** As a user, I want to switch to week/day and navigate by the right
unit, so that browsing feels natural.

#### Acceptance Criteria

1. THE view toggle SHALL offer Month, Week, Day, and Agenda.
2. WHEN the active view is week THEN previous/next SHALL move by one week; WHEN
   it is day THEN by one day; WHEN it is month THEN by one month.
3. THE "Today" control SHALL return the anchor to the current date in any view.
4. THE view and anchor date SHALL continue to be held in the existing Zustand
   calendar store.
5. WHEN the view or anchor changes THEN the visible range and displayed events
   SHALL update to match.

### Requirement 5: Event data and scoping

**User Story:** As a user, I want week/day views to load only the relevant
events, so that they stay fast and correct.

#### Acceptance Criteria

1. THE week view SHALL fetch the anchor week's events, and the day view the
   anchor day's events, from `GET /api/categories/[id]/calendar?from=&to=`.
2. THE view SHALL display only events for the current category (server-side
   scoping is authoritative).
3. WHEN the range changes THEN the calendar SHALL fetch events for the new range.

### Requirement 6: Now indicator and current day

**User Story:** As a user, I want to see the current time, so that I can orient
myself in the grid.

#### Acceptance Criteria

1. WHERE today is visible in the week or day view THE view SHALL show a now
   indicator at the current local time on today's column.
2. THE column (week view) or header (day view) for today SHALL be visually
   distinguished.

### Requirement 7: Rendering rules and states

**User Story:** As a user, I want consistent times and clear feedback, so that I
trust the views.

#### Acceptance Criteria

1. THE views SHALL render event times in the user's local timezone.
2. THE views SHALL be read-only — no create, edit, resize, or drag affordances
   (opening an event's details via the existing bottom DetailSheet on click is
   allowed).
3. WHILE events are loading THE view SHALL show a loading indicator.
4. WHERE the range has no events THE hour grid SHALL still render (empty).
