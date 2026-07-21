# Requirements Document

## Introduction

Today each category has its own isolated calendar at
`/categories/[id]/calendar`. There is no single place to see everything at once.
This change adds a **combined multi-category calendar** — a new global view
where events from **all** the user's categories are shown together on one
calendar, each category rendered in its own **color**, with **per-category
toggles** to show/hide each one.

Scope for this version:

- A new route `/(app)/calendar` (the global combined calendar). The existing
  per-category calendar at `/categories/[id]/calendar` stays exactly as it is —
  the combined view is **additive and opt-in**, not a replacement.
- A new range endpoint `GET /api/calendar?from=&to=` returning the user's
  scheduled events across **all** categories, each carrying its `categoryId` and
  the category `color`, so the client can color and filter them.
- Reuses the existing calendar UI (`month-grid`, `time-grid`, `agenda-list`,
  toolbar) and the shared `useCalendarStore` for view/anchor. Category
  visibility toggles are new session UI state.
- Drag-to-reschedule (D2) works in the combined view too, and continues to
  respect the existing **no-overlap rule**, which is already enforced
  per-user across all categories at the API layer — no backend rule changes.
- No schema changes: `Category.color` already exists (`String?`).

Out of scope for this version: editing category colors from this view (colors
are read from the category as-is; a category with no color gets a stable
derived color), and any cross-category bulk operations.

## Glossary

- **Combined calendar**: The global calendar view showing events from all of the
  user's categories at once.
- **Category toggle**: A per-category on/off control that shows or hides that
  category's events in the combined view.
- **Category color**: The visual color used to render a category's events. Read
  from `Category.color`; when null, a stable color is derived from the category
  id so the same category always looks the same.
- **Combined event**: A calendar event enriched with its owning category's id,
  name, and resolved color.
- **Active categories**: The set of categories currently toggled on; only their
  events are rendered.

## Requirements

### Requirement 1: See all categories on one calendar

**User Story:** As a user, I want one calendar that shows the events of all my
categories together, so that I can see my whole schedule in a single place.

#### Acceptance Criteria

1. WHEN a user opens `/calendar` THEN the system SHALL render a calendar showing
   scheduled events from all of the user's categories in the visible range.
2. THE combined calendar SHALL support the same views as the per-category
   calendar: month, week, day, and agenda.
3. THE combined calendar SHALL reuse the shared view/anchor state, so switching
   view or navigating periods behaves consistently with the per-category
   calendar.
4. WHERE the user has no scheduled events in the visible range THE calendar SHALL
   render an empty state without error.
5. THE existing per-category calendar at `/categories/[id]/calendar` SHALL remain
   available and unchanged.

### Requirement 2: Each category has a distinct color

**User Story:** As a user, I want each category's events shown in its own color,
so that I can tell at a glance which category an event belongs to.

#### Acceptance Criteria

1. WHERE a category has a `color` set THE system SHALL render that category's
   events using that color.
2. WHERE a category has no `color` set THE system SHALL derive a stable color
   from the category id, so the same category always renders with the same
   color across reloads.
3. THE color SHALL be applied consistently across all views (month, week, day,
   agenda).
4. THE event rendering SHALL keep sufficient text/background contrast so titles
   remain readable regardless of the category color.

### Requirement 3: Toggle categories on and off

**User Story:** As a user, I want to show or hide each category's events, so
that I can focus on the categories I care about right now.

#### Acceptance Criteria

1. THE combined calendar SHALL present a list of the user's categories, each with
   its color swatch and an on/off toggle.
2. WHEN a user turns a category off THEN the system SHALL hide that category's
   events from all views immediately.
3. WHEN a user turns a category back on THEN the system SHALL show that
   category's events again.
4. THE toggle state SHALL persist while navigating views and periods within the
   session.
5. WHERE all categories are toggled off THE calendar SHALL render an empty state
   (no events), not an error.
6. WHEN the combined view first loads THEN all categories SHALL default to on.

### Requirement 4: Combined range endpoint

**User Story:** As a developer, I want a single endpoint that returns the user's
events across all categories for a range, so that the combined view can load
efficiently in one request.

#### Acceptance Criteria

1. THE system SHALL expose `GET /api/calendar?from=&to=` returning the
   authenticated user's scheduled items whose schedule intersects the
   `[from, to)` window, across all of that user's categories.
2. EACH returned item SHALL include its owning `categoryId` and the category's
   `color` (or null when unset), so the client can color and group it.
3. WHERE `from` or `to` is missing or invalid THE endpoint SHALL respond `400`
   with a clear error and SHALL NOT return partial data.
4. THE endpoint SHALL only return items owned by the authenticated user; it
   SHALL NOT expose other users' items.
5. WHERE the user is not authenticated THE endpoint SHALL respond `401`.

### Requirement 5: Reschedule respects the no-overlap rule in the combined view

**User Story:** As a user, I want to drag events to reschedule them in the
combined view too, without ever double-booking myself.

#### Acceptance Criteria

1. THE combined calendar SHALL support drag-to-reschedule of timed events in the
   week and day views, reusing the D2 behavior (optimistic move, persist via
   `PATCH /api/planning-items/[id]`, revert on failure).
2. WHEN a drop would overlap another timed activity of the same user — in ANY
   category — THEN the system SHALL reject the change (existing no-overlap rule,
   400) and the event SHALL return to its original position with a clear
   message.
3. WHERE a drop only touches another event's boundary THE drop SHALL be allowed.
4. THE reschedule SHALL only change `startAt`/`endAt`; it SHALL NOT alter the
   event's category, list, title, priority, status, or `dueAt`.
