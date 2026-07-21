# Requirements Document

## Introduction

Every planning item already has an **item type** in the data model
(`PlanningItem.itemTypeId`), and the catalog is seeded with six types: Tarea
(default), Recordatorio, Evento, Hábito, Objetivo, Nota. But the UI never
surfaces it — new tasks silently take the default type, there is no way to
choose or change it, and the type is invisible in the lists and calendar. This
change makes the item type a **first-class, user-chosen, visible attribute**.

Scope for this version:

- **Choose** the item type when creating an item, and **change** it when
  editing (via the existing `FormSheet` edit flow).
- **Display** the type as a visually distinct badge (color + icon + name) in the
  task list rows and in the calendar's event detail sheet.
- Give each seeded item type a **consistent color and icon** so the badge reads
  the same everywhere (the seed currently leaves item-type `color`/`icon` null).
- Reuse the existing `GET /api/item-types` catalog and the existing
  `itemTypeId` support on `POST`/`PATCH /api/planning-items` — no schema
  changes.

Explicitly **out of scope** (deferred to later specs): type-driven behavior such
as reminder notifications, objective progress/checklists, or habit recurrence.
This spec is about **selecting and showing** the type, not changing how each
type behaves.

## Glossary

- **Item type**: The kind of a planning item (Tarea, Recordatorio, Evento,
  Hábito, Objetivo, Nota), stored as `PlanningItem.itemTypeId` and defined in
  the seeded `ItemType` catalog.
- **Default type**: The single `ItemType` flagged `isDefault: true` (Tarea),
  used when the user does not choose one.
- **Type badge**: The small visual chip (color + icon + name) that shows an
  item's type in the UI.
- **Catalog**: The active item types returned by `GET /api/item-types`.

## Requirements

### Requirement 1: Choose the item type when creating

**User Story:** As a user, I want to pick the type of what I'm adding (task,
reminder, event, etc.), so that my items are categorized from the start.

#### Acceptance Criteria

1. WHEN a user creates an item THEN the system SHALL let them choose its type
   from the active catalog.
2. WHERE the user does not choose a type THE system SHALL assign the default
   type (Tarea).
3. WHEN a create is submitted with a chosen type THEN the new item SHALL be
   persisted with that `itemTypeId` via `POST /api/planning-items`.
4. THE type chooser SHALL present each type with its name (and its color/icon
   affordance) so types are distinguishable at selection time.

### Requirement 2: Change the item type when editing

**User Story:** As a user, I want to change an item's type after creating it, so
that I can correct or reclassify it.

#### Acceptance Criteria

1. THE edit form SHALL include a type selector pre-filled with the item's
   current type.
2. WHEN the user changes the type and saves THEN the system SHALL persist the
   new `itemTypeId` via `PATCH /api/planning-items/[id]`.
3. THE type change SHALL NOT alter the item's other fields (title, description,
   list, priority, status, schedule, `dueAt`).
4. WHERE the user opens the edit form without changing the type THE saved item
   SHALL keep its existing type.

### Requirement 3: See the item type in the lists and calendar

**User Story:** As a user, I want to see each item's type at a glance, so that I
can tell tasks, reminders, and events apart without opening them.

#### Acceptance Criteria

1. THE task list SHALL show each item's type as a badge (color + icon + name).
2. THE calendar's event detail sheet SHALL show the item's type.
3. THE type badge SHALL render consistently (same color/icon) wherever a given
   type appears.
4. WHERE a type has no color or icon configured THE badge SHALL still render
   legibly with at least the type name (graceful fallback).

### Requirement 4: Consistent, seeded type appearance

**User Story:** As a user, I want each type to have a recognizable, stable look,
so that I learn to recognize them quickly.

#### Acceptance Criteria

1. THE seed SHALL assign each of the six item types a distinct color and an
   icon.
2. THE seed SHALL remain idempotent — re-running it SHALL update existing type
   rows to the configured color/icon without creating duplicates.
3. THE catalog endpoint SHALL expose each type's color and icon so the client
   can render the badge.

### Requirement 5: Integrity and ownership

**User Story:** As a user, I want type changes to respect the same rules as the
rest of an item, so that the data stays consistent and secure.

#### Acceptance Criteria

1. WHERE a create or update references an unknown `itemTypeId` THE system SHALL
   reject it (existing FK → NotFoundError → 404) and SHALL NOT persist.
2. THE create/update SHALL go through the same owned-item path, so a user can
   only set the type on their own items (server-side ownership is
   authoritative).
3. THE type selector SHALL only offer active catalog types.
