# Requirements Document

## Introduction

The app home (`/`) is currently an empty state that only says "no list
selected". Now that tasks have statuses, deadlines (`dueAt`), and a schedule
(`startAt`/`endAt`), the user needs a single cockpit that answers, at a glance,
"where do I stand across everything, and what needs attention now?".

This change turns `/` into a **global dashboard**: one page, segmented by
category. It shows a global summary strip (what is overdue, due today, and
coming up across all categories) plus a card per category with that category's
key numbers. It is a read-only overview — the sidebar remains the place to
create and manage structure, and the per-category calendar is a later spec.

Scope decisions already agreed with the product owner:
- **One global dashboard** (not a dashboard per category), segmented by category.
- The dashboard is **read-only** (navigation only; no create/edit here).
- The per-category **calendar** is a separate later spec; this spec may link to
  a category's lists but does not render a calendar.

## Glossary

- **Dashboard**: The global overview rendered at `/`.
- **Category card**: A dashboard section summarizing one category's tasks.
- **Open task**: A non-deleted task whose status is not `completado` and not
  `cancelado`.
- **Completed task**: A task whose status is `completado`.
- **Overdue**: An open task whose `dueAt` is strictly before now.
- **Due today**: An open task whose `dueAt` (or, when set, `startAt`) falls on
  the current local day.
- **Upcoming**: An open task whose `dueAt` or `startAt` falls within the next 7
  days (from the start of tomorrow through 7 days out).
- **Summary strip**: The dashboard's top-level totals across all categories.

## Requirements

### Requirement 1: Global dashboard at home

**User Story:** As a user, I want the home page to be a dashboard summarizing all
my work, so that I get an at-a-glance picture without opening each list.

#### Acceptance Criteria

1. WHEN an authenticated user opens `/` THEN the system SHALL render the global
   dashboard inside the existing sidebar layout.
2. THE dashboard SHALL reflect only the current user's non-deleted tasks,
   categories, and lists.
3. THE dashboard SHALL be read-only — it SHALL NOT provide task/category/list
   creation or editing controls (those remain in the sidebar).

### Requirement 2: Global summary strip

**User Story:** As a user, I want top-level totals across everything, so that I
immediately see what needs attention.

#### Acceptance Criteria

1. THE dashboard SHALL display an "overdue" total: the count of open tasks whose
   `dueAt` is before now, across all categories.
2. THE dashboard SHALL display a "due today" total across all categories.
3. THE dashboard SHALL display an "upcoming" total (next 7 days) across all
   categories.
4. THE dashboard SHALL display a total count of open tasks across all categories.
5. WHERE a total is zero THE dashboard SHALL still render the metric (showing 0),
   not hide it.

### Requirement 3: Per-category breakdown

**User Story:** As a user, I want a card per category with its key numbers, so
that I can see how each area of my life is doing.

#### Acceptance Criteria

1. THE dashboard SHALL render one card per non-deleted category the user owns.
2. EACH category card SHALL show the category's counts of open tasks, completed
   tasks, overdue tasks, and upcoming tasks.
3. EACH category card SHALL show a breakdown of open tasks by status
   (e.g. pendiente / en progreso / pausado).
4. WHEN a category has lists THEN its card SHALL let the user navigate to one of
   its lists (e.g. link each list to `/lists/[listId]`).
5. WHERE a category has no tasks THE card SHALL render a neutral empty state
   rather than being omitted.

### Requirement 4: Metric definitions are consistent

**User Story:** As a user, I want the numbers to add up consistently, so that the
dashboard is trustworthy.

#### Acceptance Criteria

1. THE system SHALL count a task as "completed" only when its status is
   `completado`, and SHALL exclude `completado` and `cancelado` tasks from
   "open" counts.
2. THE system SHALL compute "overdue", "due today", and "upcoming" using the
   user's local day boundaries (browser timezone), consistent with how the
   editor stores UTC and renders local.
3. THE global summary totals SHALL equal the sum of the corresponding
   per-category values.

### Requirement 5: Empty and onboarding states

**User Story:** As a new user with nothing set up, I want the dashboard to guide
me, so that I know what to do next.

#### Acceptance Criteria

1. WHEN the user has no categories THEN the dashboard SHALL show an onboarding
   message prompting them to create a category and list from the sidebar.
2. WHEN the user has categories but no tasks THEN the dashboard SHALL show the
   category cards with zeroed metrics and a neutral empty message.

### Requirement 6: Consistency with the sidebar

**User Story:** As a user, I want the dashboard to match what I just changed in
the sidebar, so that I never see stale structure.

#### Acceptance Criteria

1. WHEN a category or list is created, renamed, or deleted from the sidebar THEN
   the dashboard SHALL reflect the change without requiring a full page reload.
2. WHEN a list is deleted (cascading its tasks) THEN the dashboard's counts SHALL
   update to exclude that list's tasks.
